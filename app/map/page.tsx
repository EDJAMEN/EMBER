"use client";

import { useState } from "react";

interface MapHotspot {
  id: number;
  source: "VIIRS" | "MODIS";
  confidence: "high" | "medium" | "low";
  brightness: number;
  lat: number;
  lon: number;
  settlement: string;
  distKm: number;
  dayOffset: number; // 0 = today, -1 = yesterday, etc.
}

const MOCK_MAP_POINTS: MapHotspot[] = [
  { id: 1, source: "VIIRS", confidence: "high", brightness: 351.4, lat: 14.615, lon: 120.992, settlement: "Poblacion Uno", distKm: 1.4, dayOffset: 0 },
  { id: 2, source: "VIIRS", confidence: "high", brightness: 342.8, lat: 14.602, lon: 120.981, settlement: "Sitio Silangan", distKm: 2.1, dayOffset: 0 },
  { id: 3, source: "MODIS", confidence: "medium", brightness: 318.0, lat: 14.542, lon: 121.025, settlement: "Upper Basin", distKm: 4.8, dayOffset: -1 },
  { id: 4, source: "MODIS", confidence: "high", brightness: 339.2, lat: 14.630, lon: 121.010, settlement: "Forest Reserve N", distKm: 3.5, dayOffset: -2 },
  { id: 5, source: "VIIRS", confidence: "medium", brightness: 312.4, lat: 14.580, lon: 120.950, settlement: "West Perimeter", distKm: 6.2, dayOffset: -3 },
  { id: 6, source: "VIIRS", confidence: "low", brightness: 298.1, lat: 14.690, lon: 120.920, settlement: "Coastal Buffer", distKm: 11.5, dayOffset: -4 },
  { id: 7, source: "MODIS", confidence: "high", brightness: 345.0, lat: 14.510, lon: 121.060, settlement: "Ridge East", distKm: 5.1, dayOffset: -5 },
  { id: 8, source: "VIIRS", confidence: "medium", brightness: 320.6, lat: 14.490, lon: 121.080, settlement: "South Agro Valley", distKm: 7.4, dayOffset: -6 },
];

export default function MapPage() {
  const [timelineDay, setTimelineDay] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showViirs, setShowViirs] = useState<boolean>(true);
  const [showModis, setShowModis] = useState<boolean>(true);
  const [filterConfidence, setFilterConfidence] = useState<string>("all");
  const [selectedPoint, setSelectedPoint] = useState<MapHotspot | null>(MOCK_MAP_POINTS[0]);

  const filteredPoints = MOCK_MAP_POINTS.filter((p) => {
    if (p.dayOffset < timelineDay - 1) return false;
    if (p.source === "VIIRS" && !showViirs) return false;
    if (p.source === "MODIS" && !showModis) return false;
    if (filterConfidence !== "all" && p.confidence !== filterConfidence) return false;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Top Map Controls Bar */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs z-20">
        <div className="flex items-center gap-2">
          <span className="font-bold text-zinc-200">LAYER CONTROLS:</span>
          <button
            onClick={() => setShowViirs(!showViirs)}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              showViirs
                ? "bg-sky-950 text-sky-400 border border-sky-800"
                : "bg-zinc-800 text-zinc-500 border border-zinc-700"
            }`}
          >
            🛰️ VIIRS (375m)
          </button>
          <button
            onClick={() => setShowModis(!showModis)}
            className={`px-2.5 py-1 rounded font-medium transition-all ${
              showModis
                ? "bg-amber-950 text-amber-400 border border-amber-800"
                : "bg-zinc-800 text-zinc-500 border border-zinc-700"
            }`}
          >
            🛰️ MODIS (1km)
          </button>
        </div>

        {/* Confidence Filter */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-400">Confidence:</span>
          {(["all", "high", "medium", "low"] as const).map((conf) => (
            <button
              key={conf}
              onClick={() => setFilterConfidence(conf)}
              className={`px-2 py-0.5 rounded capitalize font-medium ${
                filterConfidence === conf
                  ? "bg-orange-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:text-white"
              }`}
            >
              {conf}
            </button>
          ))}
        </div>

        <div className="text-zinc-400 font-mono">
          VISIBLE HOTSPOTS: <span className="text-orange-400 font-bold">{filteredPoints.length}</span>
        </div>
      </div>

      {/* Main Map Body Split */}
      <div className="flex-1 flex flex-col lg:flex-row relative overflow-hidden">
        {/* Map Canvas / Simulated GIS View */}
        <div className="flex-1 bg-zinc-950 relative flex items-center justify-center p-4">
          {/* Subtle Grid Lines simulating GIS map */}
          <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#ea580c_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />

          {/* Coordinate Crosshairs overlay */}
          <div className="absolute top-4 left-4 font-mono text-[11px] text-zinc-500 bg-zinc-900/80 px-2.5 py-1 rounded border border-zinc-800 pointer-events-none">
            LAT: 14.5995°N | LON: 120.9842°E (SRID 4326)
          </div>

          <div className="absolute top-4 right-4 bg-zinc-900/90 border border-zinc-800 rounded-lg p-3 max-w-xs text-xs space-y-1.5 shadow-xl">
            <span className="font-bold text-orange-400 block">Frontend Hand-Off Notice</span>
            <p className="text-zinc-400 text-[11px] leading-relaxed">
              This layout is ready for <strong>react-leaflet</strong> or MapLibre GL integration.
              Hotspot data is mapped to SRID 4326 PostGIS geometry standard.
            </p>
          </div>

          {/* Simulated Interactive Map Markers */}
          <div className="relative w-full max-w-2xl h-80 sm:h-96 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-6 flex flex-col justify-between overflow-hidden shadow-2xl">
            <div className="flex justify-between items-start text-xs font-mono text-zinc-500">
              <span>BOUNDS: NW [14.750, 120.850]</span>
              <span>SE [14.400, 121.200]</span>
            </div>

            {/* Hotspot Scatter Nodes */}
            <div className="relative w-full h-48 border border-dashed border-zinc-800/60 rounded-xl flex items-center justify-center">
              {filteredPoints.map((pt, i) => {
                const posX = 15 + ((pt.lon - 120.9) / 0.2) * 70;
                const posY = 15 + ((pt.lat - 14.45) / 0.25) * 70;
                const isSelected = selectedPoint?.id === pt.id;

                return (
                  <button
                    key={pt.id}
                    onClick={() => setSelectedPoint(pt)}
                    style={{ left: `${Math.max(5, Math.min(85, posX))}%`, top: `${Math.max(5, Math.min(85, posY))}%` }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer transition-transform hover:scale-125 z-10`}
                  >
                    <span
                      className={`relative flex h-4 w-4 items-center justify-center rounded-full ${
                        pt.confidence === "high"
                          ? "bg-red-500"
                          : pt.confidence === "medium"
                          ? "bg-amber-500"
                          : "bg-sky-500"
                      } ${isSelected ? "ring-4 ring-orange-400 scale-125" : ""}`}
                    >
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 bg-current"></span>
                      <span className="text-[8px] font-bold text-zinc-950 font-mono">
                        {pt.source[0]}
                      </span>
                    </span>
                  </button>
                );
              })}

              <div className="text-zinc-600 text-xs font-mono select-none">
                [ Interactive GIS Viewport Container ]
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-red-500 inline-block"></span> High Confidence
                <span className="h-2 w-2 rounded-full bg-amber-500 inline-block ml-2"></span> Medium
                <span className="h-2 w-2 rounded-full bg-sky-500 inline-block ml-2"></span> Low
              </span>
              <span>Map Projection: EPSG:4326 WGS 84</span>
            </div>
          </div>
        </div>

        {/* Selected Hotspot Inspector Drawer (Right Side) */}
        <aside className="w-full lg:w-96 bg-zinc-900/90 border-t lg:border-t-0 lg:border-l border-zinc-800 p-5 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="font-bold text-sm text-zinc-200">Hotspot Inspector</h3>
              <span className="text-xs font-mono text-orange-400 bg-orange-950/60 px-2 py-0.5 rounded border border-orange-800/40">
                POINT #{selectedPoint?.id ?? "—"}
              </span>
            </div>

            {selectedPoint ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80">
                  <span className="text-zinc-400">Satellite Sensor</span>
                  <span className="font-bold text-zinc-100 flex items-center gap-1">
                    <span>{selectedPoint.source === "VIIRS" ? "🛰️ VIIRS" : "🛰️ MODIS"}</span>
                    <span className="text-[10px] text-zinc-500">
                      ({selectedPoint.source === "VIIRS" ? "375m²" : "1km²"})
                    </span>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono">
                  <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80">
                    <span className="text-zinc-500 block text-[10px]">CONFIDENCE</span>
                    <span
                      className={`font-bold capitalize ${
                        selectedPoint.confidence === "high"
                          ? "text-red-400"
                          : selectedPoint.confidence === "medium"
                          ? "text-amber-400"
                          : "text-sky-400"
                      }`}
                    >
                      {selectedPoint.confidence}
                    </span>
                  </div>
                  <div className="bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-800/80">
                    <span className="text-zinc-500 block text-[10px]">BRIGHTNESS</span>
                    <span className="font-bold text-amber-300">
                      {selectedPoint.brightness} K
                    </span>
                  </div>
                </div>

                <div className="bg-red-950/20 border border-red-900/40 p-3 rounded-lg space-y-1">
                  <span className="text-[10px] font-mono uppercase text-red-400 font-bold block">
                    Settlement Threat Proximity
                  </span>
                  <p className="text-zinc-200 font-medium text-xs">
                    {selectedPoint.settlement}
                  </p>
                  <p className="text-[11px] text-zinc-400">
                    Distance: <strong className="text-red-400">{selectedPoint.distKm} km</strong> (PostGIS ST_DWithin)
                  </p>
                </div>

                <div className="bg-zinc-950/60 p-3 rounded-lg border border-zinc-800/80 font-mono text-[11px] space-y-1 text-zinc-400">
                  <span className="text-zinc-500 text-[10px] block">COORDINATE PAIR</span>
                  <div>Latitude: {selectedPoint.lat.toFixed(4)}°N</div>
                  <div>Longitude: {selectedPoint.lon.toFixed(4)}°E</div>
                  <div className="text-zinc-500 text-[10px] pt-1">
                    PostGIS: POINT({selectedPoint.lon} {selectedPoint.lat})
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-zinc-500 text-xs">Click a map marker to view telemetry.</p>
            )}
          </div>

          <div className="pt-4 border-t border-zinc-800 space-y-2">
            <button
              onClick={() => alert(`DRRMC Alert dispatched for ${selectedPoint?.settlement} (${selectedPoint?.distKm} km)`)}
              className="w-full py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-semibold text-xs shadow-md transition-colors cursor-pointer"
            >
              Dispatch DRRMC Unit
            </button>
            <button
              onClick={() => alert(`Coordinates: ${selectedPoint?.lat}, ${selectedPoint?.lon}`)}
              className="w-full py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs transition-colors cursor-pointer"
            >
              Copy Coordinates
            </button>
          </div>
        </aside>
      </div>

      {/* 7-Day Timeline Playback Slider Bar */}
      <div className="bg-zinc-900/95 border-t border-zinc-800 px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>{isPlaying ? "❚❚ Pause" : "▶ Play"}</span>
          </button>
          <span className="text-xs font-mono text-zinc-400 whitespace-nowrap">
            7-DAY TIMELINE: <strong className="text-orange-400">{timelineDay === 0 ? "Today (Live)" : `${timelineDay} Days Ago`}</strong>
          </span>
        </div>

        <div className="flex-1 max-w-xl w-full flex items-center gap-3">
          <span className="text-[10px] font-mono text-zinc-500">-6d</span>
          <input
            type="range"
            min={-6}
            max={0}
            step={1}
            value={timelineDay}
            onChange={(e) => setTimelineDay(Number(e.target.value))}
            className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />
          <span className="text-[10px] font-mono text-orange-400">Live</span>
        </div>

        <div className="text-[11px] font-mono text-zinc-500 hidden md:block">
          TEMPORAL RESOLUTION: 24h
        </div>
      </div>
    </div>
  );
}
