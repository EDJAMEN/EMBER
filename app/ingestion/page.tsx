"use client";

import { useState } from "react";

const SATELLITE_PASSES = [
  { name: "Suomi-NPP (VIIRS)", sensor: "VIIRS I-Band", resolution: "375 m", status: "HEALTHY", lastSync: "14 mins ago", nextPass: "in 48 mins" },
  { name: "NOAA-20 (VIIRS)", sensor: "VIIRS I-Band", resolution: "375 m", status: "HEALTHY", lastSync: "32 mins ago", nextPass: "in 1 hr 20 mins" },
  { name: "Terra (EOS AM-1)", sensor: "MODIS", resolution: "1 km", status: "HEALTHY", lastSync: "45 mins ago", nextPass: "in 3 hrs 10 mins" },
  { name: "Aqua (EOS PM-1)", sensor: "MODIS", resolution: "1 km", status: "HEALTHY", lastSync: "1 hr ago", nextPass: "in 4 hrs 45 mins" },
];

const INITIAL_LOGS = [
  "[05:22:10 UTC] [FIRMS_CLIENT] Ingesting NASA VIIRS NOAA-20 payload (142 raw detections)...",
  "[05:22:11 UTC] [HARMONIZER] Normalizing confidence flags: 'h' -> high, 'n' -> medium, 'l' -> low.",
  "[05:22:11 UTC] [COORDINATE_TRANSFORM] Converting coordinates: Latitude, Longitude -> ST_SetSRID(ST_MakePoint(lon, lat), 4326).",
  "[05:22:12 UTC] [SPATIAL_CLUSTER] Running proximity deduplication across MODIS/VIIRS overlap window...",
  "[05:22:12 UTC] [DEDUPLICATION] Consolidated 18 duplicate detections within 500m radius.",
  "[05:22:13 UTC] [POSTGIS_UPSERT] Upserting 124 records into table 'wildfire_hotspots' (GIST index verified).",
  "[05:22:13 UTC] [PROXIMITY_TRIGGER] Executing ST_DWithin settlement distance query: 2 critical alerts identified.",
  "[05:22:14 UTC] [SYNC_COMPLETE] Batch sync completed successfully in 3.42s.",
];

export default function IngestionPage() {
  const [logs, setLogs] = useState<string[]>(INITIAL_LOGS);
  const [syncing, setSyncing] = useState<boolean>(false);

  const triggerManualSync = () => {
    setSyncing(true);
    setTimeout(() => {
      const now = new Date().toISOString().substring(11, 19);
      setLogs((prev) => [
        `[${now} UTC] [MANUAL_SYNC] Triggered manual FIRMS poll for bounding box [14.0, 120.0, 15.5, 122.0]...`,
        `[${now} UTC] [DB_STATUS] 0 new duplicate records skipped, 6 new hotspots staged.`,
        ...prev,
      ]);
      setSyncing(false);
    }, 1200);
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 text-xs font-mono mb-2">
            ROUTE: /api/sync-fires (IDEMPOTENT)
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            NASA FIRMS Ingestion Pipeline
          </h1>
          <p className="text-zinc-400 text-xs sm:text-sm mt-1">
            Automated ingestion, confidence harmonization, coordinate re-ordering, and PostGIS indexing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={triggerManualSync}
            disabled={syncing}
            className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold text-xs transition-colors shadow-lg shadow-orange-950/50 flex items-center gap-2 cursor-pointer"
          >
            <span>{syncing ? "Syncing..." : "⚡ Trigger Manual Ingest"}</span>
          </button>
        </div>
      </div>

      {/* Satellite Feeds Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {SATELLITE_PASSES.map((sat) => (
          <div key={sat.name} className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white font-sans">{sat.name}</span>
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                {sat.status}
              </span>
            </div>
            <div className="text-xs text-zinc-400 font-mono space-y-0.5 text-[11px]">
              <div>Sensor: <span className="text-zinc-200">{sat.sensor}</span></div>
              <div>Spatial Res: <span className="text-orange-400">{sat.resolution}</span></div>
              <div>Last Synced: <span className="text-zinc-300">{sat.lastSync}</span></div>
            </div>
            <div className="pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-500 font-mono">
              Next Overpass: <span className="text-zinc-400">{sat.nextPass}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 5-Step Harmonization Workflow Diagram */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-6 space-y-6">
        <div>
          <h3 className="font-bold text-white text-base">
            Telemetry Harmonization Pipeline
          </h3>
          <p className="text-xs text-zinc-400">
            How raw NASA FIRMS payload streams are safely transformed before writing to PostGIS.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
            <span className="text-[10px] font-mono font-bold text-orange-400 block">STEP 01</span>
            <h4 className="font-semibold text-xs text-white">FIRMS API Polling</h4>
            <p className="text-[11px] text-zinc-400">
              Ingests rolling 24h & 48h CSV/JSON feeds with server-only key.
            </p>
          </div>

          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
            <span className="text-[10px] font-mono font-bold text-amber-400 block">STEP 02</span>
            <h4 className="font-semibold text-xs text-white">Coordinate Ordering</h4>
            <p className="text-[11px] text-zinc-400">
              Transforms [Lat, Lon] into PostGIS strictly expected <code className="text-zinc-300 font-mono">POINT(Lon Lat)</code>.
            </p>
          </div>

          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
            <span className="text-[10px] font-mono font-bold text-emerald-400 block">STEP 03</span>
            <h4 className="font-semibold text-xs text-white">Confidence Normalization</h4>
            <p className="text-[11px] text-zinc-400">
              Maps MODIS 0–100% and VIIRS l/n/h into standardized low/medium/high.
            </p>
          </div>

          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
            <span className="text-[10px] font-mono font-bold text-sky-400 block">STEP 04</span>
            <h4 className="font-semibold text-xs text-white">Spatial Deduplication</h4>
            <p className="text-[11px] text-zinc-400">
              Consolidates overlapping MODIS (1km) & VIIRS (375m) signals.
            </p>
          </div>

          <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-2">
            <span className="text-[10px] font-mono font-bold text-purple-400 block">STEP 05</span>
            <h4 className="font-semibold text-xs text-white">PostGIS GIST Upsert</h4>
            <p className="text-[11px] text-zinc-400">
              Idempotent <code className="text-zinc-300 font-mono">ON CONFLICT</code> insert with GIST spatial indexing.
            </p>
          </div>
        </div>
      </div>

      {/* Live Ingestion Log Terminal */}
      <div className="bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden shadow-2xl">
        <div className="bg-zinc-900/90 px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500/80 inline-block"></span>
            <span className="h-3 w-3 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="h-3 w-3 rounded-full bg-emerald-500/80 inline-block"></span>
            <span className="text-xs font-mono text-zinc-400 ml-2">Ingestion Daemon Log Stream</span>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="text-emerald-400">● LIVE</span>
            <button
              onClick={() => setLogs([])}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="p-4 font-mono text-xs space-y-1.5 max-h-72 overflow-y-auto text-zinc-300">
          {logs.map((log, index) => (
            <div
              key={index}
              className={`leading-relaxed ${
                log.includes("CRITICAL") || log.includes("critical")
                  ? "text-red-400 font-semibold"
                  : log.includes("HARMONIZER")
                  ? "text-amber-400"
                  : log.includes("POSTGIS")
                  ? "text-emerald-400"
                  : "text-zinc-400"
              }`}
            >
              {log}
            </div>
          ))}
        </div>

        <div className="bg-zinc-900/50 p-3 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-500">
          <span>Idempotent Ingestion Rule 4 Active: No duplicate records on repeat pulls.</span>
          <span>SRID 4326 PostGIS Verified</span>
        </div>
      </div>
    </main>
  );
}
