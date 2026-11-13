"use client";

import { useState } from "react";

interface AlertItem {
  id: string;
  settlement: string;
  municipality: string;
  distanceKm: number;
  threatLevel: "CRITICAL" | "ELEVATED" | "ADVISORY";
  hotspotId: number;
  source: "VIIRS" | "MODIS";
  confidence: "high" | "medium";
  brightness: number;
  timestamp: string;
  dispatched: boolean;
}

const MOCK_ALERTS: AlertItem[] = [
  {
    id: "ALT-2026-001",
    settlement: "Sitio Silangan, Brgy. San Isidro",
    municipality: "Rodriguez",
    distanceKm: 1.8,
    threatLevel: "CRITICAL",
    hotspotId: 101,
    source: "VIIRS",
    confidence: "high",
    brightness: 348.6,
    timestamp: "12 mins ago",
    dispatched: false,
  },
  {
    id: "ALT-2026-002",
    settlement: "Agro-Forestry Corridor B",
    municipality: "San Mateo",
    distanceKm: 2.7,
    threatLevel: "CRITICAL",
    hotspotId: 102,
    source: "MODIS",
    confidence: "high",
    brightness: 334.2,
    timestamp: "38 mins ago",
    dispatched: true,
  },
  {
    id: "ALT-2026-003",
    settlement: "Upper Basin Watershed",
    municipality: "Antipolo City",
    distanceKm: 4.6,
    threatLevel: "ELEVATED",
    hotspotId: 103,
    source: "VIIRS",
    confidence: "medium",
    brightness: 316.5,
    timestamp: "1 hr ago",
    dispatched: false,
  },
  {
    id: "ALT-2026-004",
    settlement: "Ridge Crest Plantation",
    municipality: "Tanay",
    distanceKm: 6.9,
    threatLevel: "ADVISORY",
    hotspotId: 104,
    source: "MODIS",
    confidence: "medium",
    brightness: 308.1,
    timestamp: "2 hrs ago",
    dispatched: false,
  },
];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>(MOCK_ALERTS);
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [activeModal, setActiveModal] = useState<AlertItem | null>(null);

  const toggleDispatch = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, dispatched: !a.dispatched } : a))
    );
  };

  const filtered = alerts.filter(
    (a) => filterLevel === "all" || a.threatLevel === filterLevel
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-red-950/70 border border-red-800/50 text-red-400 text-xs font-mono mb-2">
            DRRMC EARLY RESPONSE PROTOCOL
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Settlement Proximity & DRRMC Alerts
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1">
            Real-time proximity calculations computed in PostGIS via ST_DWithin against populated zones.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => alert("Simulation: Broadcasting emergency bulletin to all active DRRMC VHF/SMS channels.")}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition-colors shadow-lg shadow-red-950/60"
          >
            📢 Broadcast Bulletin
          </button>
        </div>
      </div>

      {/* Threshold Matrix Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-red-950/20 border border-red-900/50 p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-mono text-red-400">CRITICAL TIER (&lt; 3 KM)</span>
            <span className="h-2 w-2 rounded-full bg-red-500 animate-ping"></span>
          </div>
          <p className="text-xs text-zinc-300">
            Immediate dispatch required. Fire perimeter is within 3 kilometers of resident structures.
          </p>
          <div className="text-[11px] font-mono text-red-400 font-semibold pt-1">
            Active: {alerts.filter((a) => a.threatLevel === "CRITICAL").length} settlements
          </div>
        </div>

        <div className="bg-amber-950/20 border border-amber-900/50 p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-mono text-amber-400">ELEVATED TIER (3 – 6 KM)</span>
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
          </div>
          <p className="text-xs text-zinc-300">
            Containment unit on standby. Monitoring wind vectors and rate of spread toward perimeter.
          </p>
          <div className="text-[11px] font-mono text-amber-400 font-semibold pt-1">
            Active: {alerts.filter((a) => a.threatLevel === "ELEVATED").length} settlements
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold font-mono text-zinc-400">ADVISORY TIER (6 – 10 KM)</span>
            <span className="h-2 w-2 rounded-full bg-zinc-500"></span>
          </div>
          <p className="text-xs text-zinc-300">
            Automated DRRMC situational advisory. Aerial and satellite pass tracking active.
          </p>
          <div className="text-[11px] font-mono text-zinc-400 font-semibold pt-1">
            Active: {alerts.filter((a) => a.threatLevel === "ADVISORY").length} settlements
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 text-xs border-b border-zinc-800 pb-3">
        <span className="text-zinc-500 font-mono uppercase">Filter Threat:</span>
        {["all", "CRITICAL", "ELEVATED", "ADVISORY"].map((lvl) => (
          <button
            key={lvl}
            onClick={() => setFilterLevel(lvl)}
            className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              filterLevel === lvl
                ? "bg-zinc-100 text-zinc-950 font-bold"
                : "bg-zinc-900 text-zinc-400 hover:text-white"
            }`}
          >
            {lvl}
          </button>
        ))}
      </div>

      {/* Alerts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((alertItem) => (
          <div
            key={alertItem.id}
            className={`p-5 rounded-xl border transition-all ${
              alertItem.threatLevel === "CRITICAL"
                ? "bg-gradient-to-br from-red-950/30 to-zinc-900/80 border-red-800/60"
                : alertItem.threatLevel === "ELEVATED"
                ? "bg-gradient-to-br from-amber-950/20 to-zinc-900/80 border-amber-800/50"
                : "bg-zinc-900/60 border-zinc-800"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                      alertItem.threatLevel === "CRITICAL"
                        ? "bg-red-500/20 text-red-400 border border-red-500/40"
                        : alertItem.threatLevel === "ELEVATED"
                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {alertItem.threatLevel}
                  </span>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {alertItem.id}
                  </span>
                </div>
                <h3 className="font-bold text-base text-white">
                  {alertItem.settlement}
                </h3>
                <span className="text-xs text-zinc-400">
                  Municipality: {alertItem.municipality}
                </span>
              </div>

              <div className="text-right font-mono">
                <span className="text-xs text-zinc-500 block">Proximity</span>
                <span
                  className={`text-xl font-extrabold ${
                    alertItem.distanceKm < 3 ? "text-red-400" : "text-amber-400"
                  }`}
                >
                  {alertItem.distanceKm} km
                </span>
              </div>
            </div>

            {/* Telemetry snippet */}
            <div className="my-4 p-3 rounded-lg bg-zinc-950/80 border border-zinc-800/80 grid grid-cols-3 gap-2 font-mono text-center text-xs">
              <div>
                <span className="text-zinc-500 text-[10px] block">HOTSPOT ID</span>
                <span className="text-zinc-200">#{alertItem.hotspotId}</span>
              </div>
              <div>
                <span className="text-zinc-500 text-[10px] block">FEED</span>
                <span className="text-sky-400 font-bold">{alertItem.source}</span>
              </div>
              <div>
                <span className="text-zinc-500 text-[10px] block">BRIGHTNESS</span>
                <span className="text-amber-400">{alertItem.brightness} K</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-zinc-500 text-[11px]">
                Detected {alertItem.timestamp}
              </span>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveModal(alertItem)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors cursor-pointer"
                >
                  Details
                </button>
                <button
                  onClick={() => toggleDispatch(alertItem.id)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    alertItem.dispatched
                      ? "bg-emerald-600 text-white"
                      : "bg-orange-600 hover:bg-orange-500 text-white shadow-md shadow-orange-950/50"
                  }`}
                >
                  {alertItem.dispatched ? "✓ Dispatched" : "Dispatch Unit"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* PostGIS Architecture Reference Card */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-sm text-zinc-200 flex items-center gap-2">
            <span>🗺️</span>
            <span>How PostGIS Powers Proximity Tracking (ST_DWithin)</span>
          </h4>
          <span className="text-[11px] font-mono text-zinc-500">
            ENGINEERING PRACTICE RULE 3
          </span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Rather than running expensive Euclidean loops on the client, EMBER delegates proximity search to
          the PostgreSQL engine. Distance queries leverage the <strong>GIST</strong> spatial index:
        </p>
        <div className="bg-zinc-950 p-4 rounded-lg border border-zinc-800 font-mono text-xs text-orange-300 overflow-x-auto">
          <pre>{`SELECT 
  s.name AS settlement_name,
  h.id AS hotspot_id,
  h.source,
  ROUND((ST_Distance(h.location, s.geom) / 1000)::numeric, 2) AS distance_km
FROM wildfire_hotspots h
JOIN settlements s ON ST_DWithin(h.location, s.geom, 10000)
WHERE h.confidence IN ('high', 'medium')
ORDER BY distance_km ASC;`}</pre>
        </div>
      </div>

      {/* Modal Simulation */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 max-w-lg w-full rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-zinc-800">
              <h3 className="font-bold text-white text-base">
                DRRMC Dispatch Bulletin — {activeModal.id}
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="text-zinc-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-zinc-300 font-mono bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              <div>TARGET: {activeModal.settlement} ({activeModal.municipality})</div>
              <div>PROXIMITY: {activeModal.distanceKm} km</div>
              <div>SENSOR: NASA {activeModal.source} | CONFIDENCE: {activeModal.confidence}</div>
              <div>THERMAL SIGNATURE: {activeModal.brightness} Kelvin</div>
              <div>RECOMMENDED ACTION: Bureau of Fire Protection (BFP) perimeter wetting</div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  toggleDispatch(activeModal.id);
                  setActiveModal(null);
                }}
                className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold"
              >
                Confirm Dispatch
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
