"use client";

import Link from "next/link";
import { useState } from "react";

interface Detection {
  id: number;
  source: "VIIRS" | "MODIS";
  rawConfidence: string;
  confidence: "high" | "medium" | "low";
  brightness: number;
  acq_date: string;
  acq_time: string;
  lat: number;
  lon: number;
  settlement: string;
  distanceKm: number;
  status: "CRITICAL" | "ELEVATED" | "MONITORING";
}

const MOCK_DETECTIONS: Detection[] = [
  {
    id: 101,
    source: "VIIRS",
    rawConfidence: "h (cat)",
    confidence: "high",
    brightness: 348.6,
    acq_date: "2026-11-13",
    acq_time: "05:22 UTC",
    lat: 14.5995,
    lon: 120.9842,
    settlement: "Sitio Silangan, San Isidro",
    distanceKm: 1.8,
    status: "CRITICAL",
  },
  {
    id: 102,
    source: "MODIS",
    rawConfidence: "89% (num)",
    confidence: "high",
    brightness: 334.2,
    acq_date: "2026-11-13",
    acq_time: "04:55 UTC",
    lat: 14.612,
    lon: 120.995,
    settlement: "Agro-Forestry Corridor B",
    distanceKm: 2.7,
    status: "CRITICAL",
  },
  {
    id: 103,
    source: "VIIRS",
    rawConfidence: "n (cat)",
    confidence: "medium",
    brightness: 316.5,
    acq_date: "2026-11-13",
    acq_time: "05:22 UTC",
    lat: 14.5421,
    lon: 121.0211,
    settlement: "Upper Basin Watershed",
    distanceKm: 4.6,
    status: "ELEVATED",
  },
  {
    id: 104,
    source: "MODIS",
    rawConfidence: "62% (num)",
    confidence: "medium",
    brightness: 308.1,
    acq_date: "2026-11-12",
    acq_time: "14:10 UTC",
    lat: 14.489,
    lon: 121.054,
    settlement: "Ridge Crest Plantation",
    distanceKm: 6.9,
    status: "ELEVATED",
  },
  {
    id: 105,
    source: "VIIRS",
    rawConfidence: "l (cat)",
    confidence: "low",
    brightness: 297.4,
    acq_date: "2026-11-12",
    acq_time: "18:30 UTC",
    lat: 14.671,
    lon: 120.932,
    settlement: "North Perimeter Buffer",
    distanceKm: 11.2,
    status: "MONITORING",
  },
  {
    id: 106,
    source: "VIIRS",
    rawConfidence: "h (cat)",
    confidence: "high",
    brightness: 352.0,
    acq_date: "2026-11-12",
    acq_time: "06:15 UTC",
    lat: 14.634,
    lon: 121.012,
    settlement: "Poblacion Central",
    distanceKm: 2.3,
    status: "CRITICAL",
  },
  {
    id: 107,
    source: "MODIS",
    rawConfidence: "45% (num)",
    confidence: "medium",
    brightness: 310.8,
    acq_date: "2026-11-11",
    acq_time: "13:40 UTC",
    lat: 14.521,
    lon: 120.941,
    settlement: "Coastal Mangrove Zone",
    distanceKm: 8.5,
    status: "MONITORING",
  },
];

export default function DetectionsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [confidenceFilter, setConfidenceFilter] = useState("all");

  const filtered = MOCK_DETECTIONS.filter((item) => {
    const matchesSearch =
      item.settlement.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.id.toString().includes(searchTerm) ||
      item.lat.toString().includes(searchTerm) ||
      item.lon.toString().includes(searchTerm);
    const matchesSource =
      sourceFilter === "all" || item.source === sourceFilter;
    const matchesConfidence =
      confidenceFilter === "all" || item.confidence === confidenceFilter;

    return matchesSearch && matchesSource && matchesConfidence;
  });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
      {/* Header and Callout */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-orange-950/60 border border-orange-800/40 text-orange-400 text-xs font-mono mb-2">
            TABLE: wildfire_hotspots (SRID 4326)
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Thermal Hotspot Detections Feed
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1">
            Harmonized NASA MODIS & VIIRS telemetry synced and normalized for spatial analysis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/map"
            className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow"
          >
            <span>View on Live Map</span>
            <span>→</span>
          </Link>
          <button
            onClick={() => alert("Exporting mock CSV format...")}
            className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium text-xs transition-colors"
          >
            📥 Export CSV
          </button>
        </div>
      </div>

      {/* Developer Hand-off Banner */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-zinc-300">
          <span className="text-base">💡</span>
          <span>
            <strong>Frontend Developer Note:</strong> This static page defines the full contract for{" "}
            <code className="text-orange-400 bg-zinc-950 px-1 py-0.5 rounded font-mono">
              wildfire_hotspots
            </code>
            . Connect your backend query with Supabase Client when ready.
          </span>
        </div>
        <span className="font-mono text-zinc-500 text-[11px] whitespace-nowrap">
          POSTGIS GIST INDEXED
        </span>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl">
          <span className="text-[11px] font-mono text-zinc-400">TOTAL HOTSPOTS</span>
          <p className="text-2xl font-bold text-white mt-1">{filtered.length}</p>
          <span className="text-[10px] text-zinc-500">Across active filters</span>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl">
          <span className="text-[11px] font-mono text-zinc-400">HIGH SEVERITY</span>
          <p className="text-2xl font-bold text-red-400 mt-1">
            {filtered.filter((d) => d.confidence === "high").length}
          </p>
          <span className="text-[10px] text-zinc-500">&ge; 80% / &apos;h&apos; normalized</span>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl">
          <span className="text-[11px] font-mono text-zinc-400">SETTLEMENT THREAT (&lt;3KM)</span>
          <p className="text-2xl font-bold text-amber-400 mt-1">
            {filtered.filter((d) => d.distanceKm < 3).length}
          </p>
          <span className="text-[10px] text-zinc-500">Requires DRRMC alert</span>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl">
          <span className="text-[11px] font-mono text-zinc-400">MAX TEMPERATURE</span>
          <p className="text-2xl font-bold text-orange-400 mt-1">352.0 K</p>
          <span className="text-[10px] text-zinc-500">Kelvin brightness</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-zinc-900/70 border border-zinc-800 p-4 rounded-xl flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex-1 min-w-[240px] max-w-md">
          <input
            type="text"
            placeholder="Search by settlement, record #, or coordinates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-orange-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">Source:</span>
            {["all", "VIIRS", "MODIS"].map((s) => (
              <button
                key={s}
                onClick={() => setSourceFilter(s)}
                className={`px-2.5 py-1 rounded font-medium transition-all ${
                  sourceFilter === s
                    ? "bg-orange-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400">Confidence:</span>
            {["all", "high", "medium", "low"].map((c) => (
              <button
                key={c}
                onClick={() => setConfidenceFilter(c)}
                className={`px-2.5 py-1 rounded capitalize font-medium transition-all ${
                  confidenceFilter === c
                    ? "bg-zinc-100 text-zinc-950 font-bold"
                    : "bg-zinc-800 text-zinc-400 hover:text-white"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/90 border-b border-zinc-800 text-zinc-400 font-mono text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Sensor Source</th>
                <th className="py-3 px-4">Confidence (Norm / Raw)</th>
                <th className="py-3 px-4">Brightness</th>
                <th className="py-3 px-4">Acquisition</th>
                <th className="py-3 px-4">PostGIS Point (Lon, Lat)</th>
                <th className="py-3 px-4">Settlement Proximity</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {filtered.map((item) => (
                <tr key={item.id} className="hover:bg-zinc-900/60 transition-colors">
                  <td className="py-3.5 px-4 font-bold text-zinc-300">
                    #{item.id}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        item.source === "VIIRS"
                          ? "bg-sky-950 text-sky-400 border border-sky-800/60"
                          : "bg-amber-950 text-amber-400 border border-amber-800/60"
                      }`}
                    >
                      {item.source}
                    </span>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-1.5 font-sans">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold capitalize ${
                          item.confidence === "high"
                            ? "bg-red-950/80 text-red-400 border border-red-800/60"
                            : item.confidence === "medium"
                            ? "bg-amber-950/80 text-amber-400 border border-amber-800/60"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {item.confidence}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        ({item.rawConfidence})
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-zinc-200">
                    {item.brightness} K
                  </td>
                  <td className="py-3.5 px-4 text-zinc-400 text-[11px]">
                    {item.acq_date} <span className="text-zinc-500">{item.acq_time}</span>
                  </td>
                  <td className="py-3.5 px-4 text-[11px] text-zinc-300">
                    <span className="bg-zinc-950 px-2 py-1 rounded border border-zinc-800">
                      POINT({item.lon} {item.lat})
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-sans">
                    <div className="text-zinc-200 font-medium">{item.settlement}</div>
                    <div
                      className={`text-[11px] font-mono ${
                        item.distanceKm < 3
                          ? "text-red-400 font-bold"
                          : item.distanceKm < 6
                          ? "text-amber-400"
                          : "text-zinc-500"
                      }`}
                    >
                      {item.distanceKm} km away (ST_DWithin)
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() =>
                        alert(`Triggering advisory for Record #${item.id} near ${item.settlement}`)
                      }
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-orange-600 hover:text-white text-zinc-300 text-[11px] transition-colors font-sans cursor-pointer"
                    >
                      Dispatch
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-500">
          <span>Displaying 1–{filtered.length} of {filtered.length} harmonized records</span>
          <div className="flex gap-2">
            <button className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-50">
              Previous
            </button>
            <button className="px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 disabled:opacity-50">
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

