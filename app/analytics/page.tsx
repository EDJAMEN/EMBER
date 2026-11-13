"use client";

import { useState } from "react";

export default function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<"24h" | "7d" | "30d">("7d");

  // Mock historical ingestion daily counts
  const DAILY_DATA = [
    { day: "Mon", viirs: 42, modis: 18, total: 60 },
    { day: "Tue", viirs: 56, modis: 24, total: 80 },
    { day: "Wed", viirs: 78, modis: 31, total: 109 },
    { day: "Thu", viirs: 64, modis: 29, total: 93 },
    { day: "Fri", viirs: 92, modis: 38, total: 130 },
    { day: "Sat", viirs: 110, modis: 45, total: 155 },
    { day: "Sun", viirs: 84, modis: 36, total: 120 },
  ];

  const MUNICIPALITIES = [
    { name: "Rodriguez (Montalban)", activeFires: 8, highestBrightness: "348.6 K", risk: "CRITICAL" },
    { name: "San Mateo", activeFires: 5, highestBrightness: "334.2 K", risk: "CRITICAL" },
    { name: "Antipolo City", activeFires: 4, highestBrightness: "316.5 K", risk: "ELEVATED" },
    { name: "Tanay", activeFires: 3, highestBrightness: "308.1 K", risk: "ELEVATED" },
    { name: "Baras", activeFires: 1, highestBrightness: "297.4 K", risk: "ADVISORY" },
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-orange-950/60 border border-orange-800/40 text-orange-400 text-xs font-mono mb-2">
            TELEMETRY INTELLIGENCE & SITREP
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Burn-Zone Analytics & Historical Trends
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1">
            Harmonized satellite pass trends, thermal radiation statistics, and spatial cluster metrics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(["24h", "7d", "30d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-colors cursor-pointer ${
                timeRange === r
                  ? "bg-orange-600 text-white shadow"
                  : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {r}
            </button>
          ))}
          <button
            onClick={() => alert("Generating automated DRRMC SITREP PDF report...")}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors border border-zinc-700/60"
          >
            📄 Generate SITREP
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl space-y-1">
          <span className="text-[11px] font-mono text-zinc-400">TOTAL HOTSPOTS ({timeRange.toUpperCase()})</span>
          <p className="text-2xl sm:text-3xl font-extrabold text-white">747</p>
          <p className="text-[11px] text-emerald-400">▲ +12% from previous window</p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl space-y-1">
          <span className="text-[11px] font-mono text-zinc-400">EST. BURN SCAR AREA</span>
          <p className="text-2xl sm:text-3xl font-extrabold text-amber-400">3,420 ha</p>
          <p className="text-[11px] text-zinc-500">VIIRS 375m polygon perimeter</p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl space-y-1">
          <span className="text-[11px] font-mono text-zinc-400">PEAK RADIATIVE POWER</span>
          <p className="text-2xl sm:text-3xl font-extrabold text-red-400">84.6 MW</p>
          <p className="text-[11px] text-zinc-500">Max recorded FRP intensity</p>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-xl space-y-1">
          <span className="text-[11px] font-mono text-zinc-400">SETTLEMENTS AT RISK</span>
          <p className="text-2xl sm:text-3xl font-extrabold text-orange-400">5 Towns</p>
          <p className="text-[11px] text-zinc-500">Within 3 km of active thermal cluster</p>
        </div>
      </div>

      {/* Visual Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Ingestion Volume Chart */}
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-white text-base">
                Daily Satellite Ingestion Volume
              </h3>
              <p className="text-xs text-zinc-400">
                Comparing high-resolution VIIRS (375m) vs MODIS (1km) detection counts.
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-sky-400">
                <span className="h-2.5 w-2.5 rounded bg-sky-500"></span> VIIRS
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="h-2.5 w-2.5 rounded bg-amber-500"></span> MODIS
              </span>
            </div>
          </div>

          {/* Bar Chart Representation */}
          <div className="h-64 flex items-end justify-between gap-2 sm:gap-4 pt-8 pb-2 border-b border-zinc-800">
            {DAILY_DATA.map((d) => (
              <div key={d.day} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                <div className="text-[10px] font-mono text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  {d.total}
                </div>
                <div className="w-full max-w-[32px] flex flex-col items-center gap-0.5">
                  <div
                    style={{ height: `${(d.viirs / 160) * 160}px` }}
                    className="w-full bg-sky-600 rounded-t group-hover:bg-sky-500 transition-colors"
                  />
                  <div
                    style={{ height: `${(d.modis / 160) * 160}px` }}
                    className="w-full bg-amber-600 rounded-b group-hover:bg-amber-500 transition-colors"
                  />
                </div>
                <span className="text-[11px] font-mono text-zinc-400 mt-1">
                  {d.day}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Peak detection surge observed during weekend afternoon satellite overpasses.</span>
            <span className="font-mono">Harmonized Deduplicated Total: 747</span>
          </div>
        </div>

        {/* Right Col: Severity Breakdown */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 space-y-6 flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-white text-base mb-1">
              Confidence Severity Breakdown
            </h3>
            <p className="text-xs text-zinc-400">
              Normalized satellite telemetry mapping across all active burn zones.
            </p>

            <div className="mt-6 space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1 font-mono">
                  <span className="text-red-400 font-bold">HIGH CONFIDENCE (&ge;80% / &apos;h&apos;)</span>
                  <span className="text-zinc-300">38% (284)</span>
                </div>
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: "38%" }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1 font-mono">
                  <span className="text-amber-400 font-bold">MEDIUM CONFIDENCE (30–79% / &apos;n&apos;)</span>
                  <span className="text-zinc-300">46% (344)</span>
                </div>
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: "46%" }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1 font-mono">
                  <span className="text-zinc-400 font-bold">LOW CONFIDENCE (&lt;30% / &apos;l&apos;)</span>
                  <span className="text-zinc-300">16% (119)</span>
                </div>
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-zinc-600 rounded-full" style={{ width: "16%" }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-400 space-y-1">
            <span className="font-semibold text-zinc-200 block">De-duplication Ratio</span>
            <p className="text-[11px]">
              Spatial proximity clustering consolidated <strong>312 overlapping signals</strong>, preventing redundant field dispatches.
            </p>
          </div>
        </div>
      </div>

      {/* High-Risk Municipalities Table */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white text-base">
              Vulnerable Settlement Risk Index
            </h3>
            <p className="text-xs text-zinc-400">
              Ranked by active wildfire clusters within 10km proximity zone.
            </p>
          </div>
          <span className="text-xs font-mono text-zinc-400 bg-zinc-950 px-3 py-1 rounded border border-zinc-800">
            DRRMC REGION IV-A
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b border-zinc-800 text-zinc-400 text-[11px] uppercase">
              <tr>
                <th className="py-2.5 px-3">Municipality / Area</th>
                <th className="py-2.5 px-3">Active Hotspot Clusters</th>
                <th className="py-2.5 px-3">Peak Brightness (Kelvin)</th>
                <th className="py-2.5 px-3">DRRMC Threat Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {MUNICIPALITIES.map((m) => (
                <tr key={m.name} className="hover:bg-zinc-900/80 transition-colors">
                  <td className="py-3 px-3 font-semibold text-white font-sans">
                    {m.name}
                  </td>
                  <td className="py-3 px-3 text-orange-400 font-bold">
                    {m.activeFires} clusters
                  </td>
                  <td className="py-3 px-3 text-zinc-300">
                    {m.highestBrightness}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        m.risk === "CRITICAL"
                          ? "bg-red-500/20 text-red-400 border border-red-500/40"
                          : m.risk === "ELEVATED"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {m.risk}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-sans">
                    <button
                      onClick={() => alert(`Reviewing tactical action plan for ${m.name}`)}
                      className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-orange-600 hover:text-white text-zinc-300 text-[11px] transition-colors"
                    >
                      Review Plan
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
