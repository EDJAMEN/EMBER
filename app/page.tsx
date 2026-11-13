"use client";

import Link from "next/link";
import { useState } from "react";

interface HotspotRecord {
  id: number;
  source: "VIIRS" | "MODIS";
  rawConfidence: string;
  confidence: "high" | "medium" | "low";
  brightness: number;
  acq_date: string;
  acq_time: string;
  lat: number;
  lon: number;
  proximityKm: number;
  nearestSettlement: string;
  status: "CRITICAL" | "ELEVATED" | "MONITORING";
}

const SAMPLE_HOTSPOTS: HotspotRecord[] = [
  {
    id: 101,
    source: "VIIRS",
    rawConfidence: "h (categorical)",
    confidence: "high",
    brightness: 348.6,
    acq_date: "2026-11-13",
    acq_time: "05:22 UTC",
    lat: 14.5995,
    lon: 120.9842,
    proximityKm: 1.8,
    nearestSettlement: "Sitio Silangan, Brgy. San Isidro",
    status: "CRITICAL",
  },
  {
    id: 102,
    source: "MODIS",
    rawConfidence: "89% (numeric)",
    confidence: "high",
    brightness: 334.2,
    acq_date: "2026-11-13",
    acq_time: "04:55 UTC",
    lat: 14.612,
    lon: 120.995,
    proximityKm: 2.7,
    nearestSettlement: "Agro-Forestry Corridor B",
    status: "CRITICAL",
  },
  {
    id: 103,
    source: "VIIRS",
    rawConfidence: "n (categorical)",
    confidence: "medium",
    brightness: 316.5,
    acq_date: "2026-11-13",
    acq_time: "05:22 UTC",
    lat: 14.5421,
    lon: 121.0211,
    proximityKm: 4.6,
    nearestSettlement: "Upper Basin Watershed",
    status: "ELEVATED",
  },
  {
    id: 104,
    source: "MODIS",
    rawConfidence: "62% (numeric)",
    confidence: "medium",
    brightness: 308.1,
    acq_date: "2026-11-12",
    acq_time: "14:10 UTC",
    lat: 14.489,
    lon: 121.054,
    proximityKm: 6.9,
    nearestSettlement: "Ridge Crest Plantation",
    status: "ELEVATED",
  },
  {
    id: 105,
    source: "VIIRS",
    rawConfidence: "l (categorical)",
    confidence: "low",
    brightness: 297.4,
    acq_date: "2026-11-12",
    acq_time: "18:30 UTC",
    lat: 14.671,
    lon: 120.932,
    proximityKm: 11.2,
    nearestSettlement: "North Perimeter Buffer",
    status: "MONITORING",
  },
];

export default function HomePage() {
  const [selectedConfidence, setSelectedConfidence] = useState<string>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"overview" | "harmonization" | "database">("overview");
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotRecord | null>(SAMPLE_HOTSPOTS[0]);

  const filteredHotspots = SAMPLE_HOTSPOTS.filter((item) => {
    const matchConfidence =
      selectedConfidence === "all" || item.confidence === selectedConfidence;
    const matchSource =
      selectedSource === "all" || item.source === selectedSource;
    return matchConfidence && matchSource;
  });

  return (
    <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-10">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-6 sm:p-10 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-orange-600/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-20 w-80 h-80 rounded-full bg-red-600/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs font-medium text-orange-400">
            <span>🛰️ Satellite Thermal Feed Harmonizer</span>
            <span className="h-1 w-1 rounded-full bg-orange-500"></span>
            <span>PostGIS Spatial Intelligence</span>
          </div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Satellite Data for{" "}
            <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-red-500 bg-clip-text text-transparent">
              Disaster Risk Management
            </span>
          </h1>
          <p className="text-zinc-400 text-sm sm:text-base leading-relaxed">
            EMBER eliminates fragmented disaster response by unifying <strong>NASA MODIS</strong> and{" "}
            <strong>VIIRS</strong> satellite thermal telemetry into an authoritative, real-time geospatial
            early-warning dashboard designed for Disaster Risk Reduction and Management Councils (DRRMCs) and vulnerable communities.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/map"
              className="px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-all shadow-lg shadow-orange-950/60 flex items-center gap-2"
            >
              <span>Launch Geospatial Map</span>
              <span>→</span>
            </Link>
            <Link
              href="/alerts"
              className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 font-semibold text-xs transition-all flex items-center gap-2"
            >
              <span>Settlement Alerts</span>
            </Link>
            <Link
              href="/ingestion"
              className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 font-semibold text-xs transition-all"
            >
              <span>Ingestion Pipeline</span>
            </Link>
          </div>
        </div>

        {/* Quick Metrics Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-8 border-t border-zinc-800/80">
          <Link
            href="/ingestion"
            className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl hover:border-orange-500/50 transition-colors group"
          >
            <span className="text-xs font-mono text-zinc-400 group-hover:text-orange-400">CONSTELLATIONS</span>
            <p className="text-xl font-bold text-orange-400 mt-1">MODIS & VIIRS</p>
            <span className="text-[11px] text-zinc-500">Unified Ingestion Pipeline</span>
          </Link>
          <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl">
            <span className="text-xs font-mono text-zinc-400">MAX RESOLUTION</span>
            <p className="text-xl font-bold text-amber-400 mt-1">375m / Pixel</p>
            <span className="text-[11px] text-zinc-500">VIIRS I-Band High Fidelity</span>
          </div>
          <Link
            href="/map"
            className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl hover:border-emerald-500/50 transition-colors group"
          >
            <span className="text-xs font-mono text-zinc-400 group-hover:text-emerald-400">GEOSPATIAL ENGINE</span>
            <p className="text-xl font-bold text-emerald-400 mt-1">PostGIS GIST</p>
            <span className="text-[11px] text-zinc-500">Sub-second ST_DWithin queries</span>
          </Link>
          <Link
            href="/alerts"
            className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl hover:border-red-500/50 transition-colors group"
          >
            <span className="text-xs font-mono text-zinc-400 group-hover:text-red-400">ALERT RADIUS</span>
            <p className="text-xl font-bold text-red-400 mt-1">1.8 km Alert</p>
            <span className="text-[11px] text-zinc-500">Nearest Poblacion proximity</span>
          </Link>
        </div>
      </section>

      {/* Tab Controls */}
      <div className="flex border-b border-zinc-800 gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab("overview")}
          className={`pb-3 border-b-2 transition-all cursor-pointer ${activeTab === "overview"
            ? "border-orange-500 text-orange-400"
            : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
        >
          Live Detections & Proximity
        </button>
        <button
          onClick={() => setActiveTab("harmonization")}
          className={`pb-3 border-b-2 transition-all cursor-pointer ${activeTab === "harmonization"
            ? "border-orange-500 text-orange-400"
            : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
        >
          Feed Harmonization Logic
        </button>
        <button
          onClick={() => setActiveTab("database")}
          className={`pb-3 border-b-2 transition-all cursor-pointer ${activeTab === "database"
            ? "border-orange-500 text-orange-400"
            : "border-transparent text-zinc-400 hover:text-zinc-200"
            }`}
        >
          PostGIS Schema & Practices
        </button>
      </div>

      {/* Tab 1: Overview & Hotspot Feed Sample */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Filter Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-900/70 border border-zinc-800 p-4 rounded-xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Confidence Filter:
              </span>
              {(["all", "high", "medium", "low"] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setSelectedConfidence(level)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-all cursor-pointer ${selectedConfidence === level
                    ? "bg-zinc-100 text-zinc-950 shadow"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                >
                  {level}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                Sensor Source:
              </span>
              {(["all", "VIIRS", "MODIS"] as const).map((src) => (
                <button
                  key={src}
                  onClick={() => setSelectedSource(src)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${selectedSource === src
                    ? "bg-orange-600 text-white shadow"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                    }`}
                >
                  {src}
                </button>
              ))}
            </div>
          </div>

          {/* Split Grid: Feed List & Inspection Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Feed List */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                <span>SHOWING {filteredHotspots.length} HARMONIZED HOTSPOTS</span>
                <Link href="/detections" className="text-orange-400 hover:underline">
                  View full feed table →
                </Link>
              </div>

              {filteredHotspots.length === 0 ? (
                <div className="bg-zinc-900/40 border border-dashed border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">
                  No detections match the selected criteria.
                </div>
              ) : (
                filteredHotspots.map((item) => {
                  const isSelected = selectedHotspot?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedHotspot(item)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${isSelected
                        ? "bg-zinc-900 border-orange-500/80 shadow-lg shadow-orange-950/20"
                        : "bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900/80 hover:border-zinc-700"
                        }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${item.source === "VIIRS"
                              ? "bg-sky-950 text-sky-400 border border-sky-800/60"
                              : "bg-amber-950 text-amber-400 border border-amber-800/60"
                              }`}
                          >
                            {item.source}
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded capitalize ${item.confidence === "high"
                              ? "bg-red-950/80 text-red-400 border border-red-800/60"
                              : item.confidence === "medium"
                                ? "bg-amber-950/80 text-amber-400 border border-amber-800/60"
                                : "bg-zinc-800 text-zinc-400"
                              }`}
                          >
                            {item.confidence} confidence
                          </span>
                          <span className="text-xs text-zinc-500 font-mono">
                            #{item.id}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${item.status === "CRITICAL"
                              ? "bg-red-500/10 text-red-400 border border-red-500/30 animate-pulse"
                              : item.status === "ELEVATED"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                                : "bg-zinc-800 text-zinc-400"
                              }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div>
                          <span className="text-zinc-400">Nearest Settlement: </span>
                          <span className="text-zinc-200 font-medium">
                            {item.nearestSettlement}
                          </span>
                        </div>
                        <div className="font-mono text-zinc-300">
                          Proximity:{" "}
                          <span
                            className={
                              item.proximityKm < 3
                                ? "text-red-400 font-bold"
                                : item.proximityKm < 6
                                  ? "text-amber-400 font-semibold"
                                  : "text-zinc-400"
                            }
                          >
                            {item.proximityKm.toFixed(1)} km
                          </span>
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-zinc-800/60 flex flex-wrap items-center justify-between text-[11px] text-zinc-400 font-mono">
                        <span>
                          Coords: {item.lat.toFixed(4)}°N, {item.lon.toFixed(4)}°E
                        </span>
                        <span>Brightness: {item.brightness} K</span>
                        <span>
                          Acquired: {item.acq_date} {item.acq_time}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Right Col: Settlement Proximity & Telemetry Inspector */}
            <div className="space-y-4">
              <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
                  <h3 className="font-semibold text-sm text-zinc-200">
                    Telemetry Deep-Dive
                  </h3>
                  <span className="text-[11px] font-mono text-zinc-500">
                    RECORD #{selectedHotspot?.id ?? "N/A"}
                  </span>
                </div>

                {selectedHotspot ? (
                  <div className="space-y-3 text-xs">
                    <div>
                      <span className="text-zinc-500 block mb-0.5">Satellite Feed Source</span>
                      <div className="font-medium text-zinc-200 flex items-center gap-2">
                        <span className="text-base">🛰️</span>
                        <span>NASA {selectedHotspot.source}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">
                          {selectedHotspot.source === "VIIRS"
                            ? "(375m² resolution)"
                            : "(1km² resolution)"}
                        </span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 space-y-1.5 font-mono">
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Raw Source Value:</span>
                        <span className="text-amber-400">{selectedHotspot.rawConfidence}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Normalized Tier:</span>
                        <span className="text-emerald-400 uppercase font-bold">
                          {selectedHotspot.confidence}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-500">Thermal Brightness:</span>
                        <span className="text-zinc-200">{selectedHotspot.brightness} Kelvin</span>
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-red-950/20 border border-red-900/40 space-y-2">
                      <div className="flex items-center gap-1.5 text-red-400 font-semibold text-[11px]">
                        <span>⚠️</span>
                        <span>Settlement Proximity Tracker</span>
                      </div>
                      <p className="text-[11px] text-zinc-300">
                        Hotspot is within{" "}
                        <strong className="text-red-300">
                          {selectedHotspot.proximityKm} km
                        </strong>{" "}
                        of <strong>{selectedHotspot.nearestSettlement}</strong>.
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        PostGIS spatial calculation computed using index-accelerated{" "}
                        <code className="text-zinc-300 bg-zinc-900 px-1 py-0.5 rounded">
                          ST_DWithin
                        </code>{" "}
                        against national settlement boundaries.
                      </p>
                    </div>

                    <div className="pt-2">
                      <span className="text-zinc-500 block mb-1">PostGIS Point Geometry</span>
                      <div className="font-mono text-[11px] bg-zinc-950 p-2.5 rounded border border-zinc-800 break-all text-zinc-300">
                        POINT({selectedHotspot.lon} {selectedHotspot.lat})
                      </div>
                      <span className="text-[10px] text-zinc-500 mt-1 block">
                        SRID 4326: strictly formatted as (Longitude, Latitude) per PostGIS standard.
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-zinc-500 text-xs">Select a record to inspect its details.</p>
                )}
              </div>

              {/* DRRMC Alert Action Card */}
              <div className="bg-gradient-to-br from-orange-950/40 via-zinc-900 to-zinc-900 border border-orange-900/40 rounded-xl p-5">
                <h4 className="text-xs font-bold text-orange-300 tracking-wide uppercase mb-1">
                  DRRMC Dispatch Integration
                </h4>
                <p className="text-[11px] text-zinc-400 mb-3">
                  Automated cluster analysis prevents redundant alarms by consolidating overlapping
                  MODIS (1 km) and VIIRS (375 m) telemetry before issuing dispatch notices.
                </p>
                <Link
                  href="/alerts"
                  className="w-full py-2 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-all shadow-md flex items-center justify-center gap-1.5"
                >
                  <span>Go to DRRMC Alert Center</span>
                  <span>→</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Harmonization Rules & Engine */}
      {activeTab === "harmonization" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">🛰️</span>
              <h3 className="font-bold text-white text-base">
                Confidence Score Normalization
              </h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              NASA MODIS and VIIRS operate under divergent reporting standards. All incoming feeds
              are mapped into 3 standardized tiers during ingestion:
            </p>

            <div className="space-y-3 pt-2">
              <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-800 text-xs">
                <div className="font-semibold text-amber-400 mb-1">MODIS (Numeric 0 – 100%)</div>
                <ul className="text-zinc-400 space-y-1 font-mono text-[11px]">
                  <li>• &lt; 30% → <span className="text-zinc-300 font-bold">&apos;low&apos;</span></li>
                  <li>• 30% – 79% → <span className="text-amber-400 font-bold">&apos;medium&apos;</span></li>
                  <li>• &ge; 80% → <span className="text-red-400 font-bold">&apos;high&apos;</span></li>
                </ul>
              </div>

              <div className="bg-zinc-950/80 p-3 rounded-lg border border-zinc-800 text-xs">
                <div className="font-semibold text-sky-400 mb-1">VIIRS (Categorical Flags)</div>
                <ul className="text-zinc-400 space-y-1 font-mono text-[11px]">
                  <li>• &apos;l&apos; (low) → <span className="text-zinc-300 font-bold">&apos;low&apos;</span></li>
                  <li>• &apos;n&apos; (nominal) → <span className="text-amber-400 font-bold">&apos;medium&apos;</span></li>
                  <li>• &apos;h&apos; (high) → <span className="text-red-400 font-bold">&apos;high&apos;</span></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xl">📐</span>
              <h3 className="font-bold text-white text-base">
                Spatial Resolution & Clustering
              </h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Because VIIRS captures high-fidelity 375m pixels while MODIS covers 1km, a single burn zone
              generates overlapping duplicate signals. EMBER clusters records to preserve alert accuracy:
            </p>

            <div className="bg-zinc-950/80 p-4 rounded-lg border border-zinc-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-300">
                <span>VIIRS Resolution:</span>
                <span className="text-sky-400 font-bold">375 m² / footprint</span>
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-300">
                <span>MODIS Resolution:</span>
                <span className="text-amber-400 font-bold">~1 km² / footprint</span>
              </div>
              <div className="pt-2 border-t border-zinc-800 text-zinc-400 text-[11px]">
                ✓ Prevents alert inflation for local DRRMC field responders.
                ✓ Preserves historical satellite pass records for burn-scar progression analysis.
              </div>
            </div>

            <div className="bg-orange-950/20 border border-orange-900/30 p-3 rounded-lg text-xs text-orange-300">
              <strong>Coordinate Ordering Convention:</strong> PostGIS strictly requires{" "}
              <code className="bg-zinc-900 px-1 py-0.5 rounded text-white font-mono">
                POINT(Longitude, Latitude)
              </code>
              . Frontends typically use [Lat, Lon]. Our ingestion layer automatically flips coordinates.
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Database & Engineering Practices */}
      {activeTab === "database" && (
        <div className="space-y-6">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base">
                  Supabase + PostGIS Database Architecture
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Managed migration file:{" "}
                  <code className="text-zinc-300 bg-zinc-950 px-2 py-0.5 rounded font-mono">
                    supabase/migrations/20261113114819_init_ember_schema.sql
                  </code>
                </p>
              </div>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/80 border border-emerald-800/60 px-2.5 py-1 rounded-full">
                MIGRATED
              </span>
            </div>

            <div className="bg-zinc-950 rounded-xl border border-zinc-800 p-4 font-mono text-xs text-zinc-300 overflow-x-auto">
              <pre>{`-- 1. Enable PostGIS extension FIRST so GEOGRAPHY type works
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Create the unified hotspots table for MODIS and VIIRS
CREATE TABLE wildfire_hotspots (
    id SERIAL PRIMARY KEY,
    source TEXT NOT NULL,         -- 'MODIS' or 'VIIRS'
    confidence TEXT NOT NULL,     -- Normalized: 'low', 'medium', 'high'
    brightness FLOAT,
    acq_date DATE NOT NULL,
    acq_time TEXT NOT NULL,
    location GEOGRAPHY (Point, 4326) NOT NULL, -- PostGIS spatial point (Lon, Lat)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add a spatial index for fast proximity queries
CREATE INDEX idx_wildfire_hotspots_location ON wildfire_hotspots USING GIST (location);`}</pre>
            </div>
          </div>

          {/* Strict Engineering Practices Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-xl space-y-2">
              <span className="text-xs font-bold text-orange-400">Rule 1: CLI Migrations Only</span>
              <p className="text-xs text-zinc-400">
                Zero manual dashboard edits. All schema mutations reside inside versioned migration files deployed via{" "}
                <code className="text-zinc-200">npx supabase db push</code>.
              </p>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-xl space-y-2">
              <span className="text-xs font-bold text-orange-400">Rule 2: Key Separation</span>
              <p className="text-xs text-zinc-400">
                Only anon keys exposed via <code className="text-zinc-200">NEXT_PUBLIC_*</code>. Service role and NASA FIRMS keys remain strictly in server handlers.
              </p>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800 p-4 rounded-xl space-y-2">
              <span className="text-xs font-bold text-orange-400">Rule 3: GIST Spatial Querying</span>
              <p className="text-xs text-zinc-400">
                Settlement proximity and radius searches execute in PostGIS using <code className="text-zinc-200">ST_DWithin</code> rather than client-side Haversine loops.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
