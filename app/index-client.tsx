"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Flame,
  LocateFixed,
  MapPin,
  Maximize2,
  Minus,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Radio,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wind,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
const EmberMap = dynamic(() => import("@/components/ember-map").then((m) => m.EmberMap), {
  ssr: false,
});
import { EmberShell } from "@/components/ember-shell";
import { useTheme } from "@/hooks/use-theme";
import { HOTSPOTS, type Confidence } from "@/lib/hotspots";
import { fetchFirmsHotspots } from "@/lib/firms-client";
import type L from "leaflet";

const SEVERITY_OF: Record<Confidence, string> = {
  high: "critical",
  medium: "high",
  low: "low",
};

const BADGE_OF: Record<Confidence, string> = {
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};

export function EmberDashboard() {
  const { dark } = useTheme();
  const mapRef = useRef<L.Map | null>(null);
  const handleMapReady = useCallback((map: L.Map) => {
    mapRef.current = map;
  }, []);
  const [confidence, setConfidence] = useState<"all" | Confidence>("all");
  const [showViirs, setShowViirs] = useState(true);
  const [showModis, setShowModis] = useState(true);
  const [dayCursor, setDayCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState(false);
  const firmsQuery = useQuery({
    queryKey: ["firms-hotspots"],
    queryFn: () => fetchFirmsHotspots(),
    enabled: live,
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const baseHotspots = live && firmsQuery.data?.length ? firmsQuery.data : HOTSPOTS;
  const [selectedId, setSelectedId] = useState<number>(HOTSPOTS[0]?.id ?? 0);
  const [selectedLayer, setSelectedLayer] = useState("Thermal anomalies");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setDayCursor((day) => {
        if (day <= -6) {
          setPlaying(false);
          return 0;
        }
        return day - 1;
      });
    }, 1200);
    return () => clearInterval(timer);
  }, [playing]);

  const visibleHotspots = useMemo(
    () =>
      baseHotspots.filter((hotspot) => {
        if (confidence !== "all" && hotspot.confidence !== confidence) return false;
        if (hotspot.source === "VIIRS" && !showViirs) return false;
        if (hotspot.source === "MODIS" && !showModis) return false;
        if (hotspot.dayOffset > dayCursor || hotspot.dayOffset < dayCursor - 1) return false;
        const query = search.toLowerCase();
        if (
          query &&
          !`${hotspot.name} ${hotspot.settlement} ${hotspot.municipality}`
            .toLowerCase()
            .includes(query)
        )
          return false;
        return true;
      }),
    [confidence, showViirs, showModis, dayCursor, search, baseHotspots],
  );

  const selectedHotspot = visibleHotspots.find((h) => h.id === selectedId) ?? visibleHotspots[0];
  const selectedIndex = selectedHotspot ? visibleHotspots.indexOf(selectedHotspot) : 0;
  const activeCount = visibleHotspots.length;
  const highCount = visibleHotspots.filter((h) => h.confidence === "high").length;
  const closest = visibleHotspots.reduce(
    (min, h) => Math.min(min, h.proximityKm),
    visibleHotspots[0]?.proximityKm ?? 0,
  );

  return (
    <EmberShell active="overview" title="Overview">
      <section className="ember-page-heading">
        <div>
          <div className="ember-eyebrow">
            <span /> FIELD OPERATIONS <span className="ember-eyebrow-date">/ NOV 13, 2026</span>
          </div>
          <h1>
            Good morning, team<span>.</span>
          </h1>
          <p>Here’s the latest across your monitored region.</p>
        </div>
        <Button variant="outline" className="ember-export-button" asChild>
          <Link href="/detections">
            <Radio size={15} /> Export briefing
          </Link>
        </Button>
      </section>

      <section className="ember-stat-grid" aria-label="Monitoring summary">
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>ACTIVE DETECTIONS</span>
            <span className="ember-stat-icon ember-icon-coral">
              <Flame size={16} />
            </span>
          </div>
          <div className="ember-stat-number">{activeCount}</div>
          <div className="ember-stat-foot">
            <span className="ember-change ember-up">
              <ArrowUpRight size={13} /> 12%
            </span>
            <span>vs. previous 24h</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>HIGH CONFIDENCE</span>
            <span className="ember-stat-icon ember-icon-amber">
              <AlertTriangle size={16} />
            </span>
          </div>
          <div className="ember-stat-number">{highCount}</div>
          <div className="ember-stat-foot">
            <span className="ember-change ember-neutral">MODIS + VIIRS</span>
            <span>confirmed by both</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>NEAR COMMUNITIES</span>
            <span className="ember-stat-icon ember-icon-sky">
              <MapPin size={16} />
            </span>
          </div>
          <div className="ember-stat-number">
            {visibleHotspots.length}
            <span className="ember-stat-unit"> sites</span>
          </div>
          <div className="ember-stat-foot">
            <span className="ember-change ember-up">
              <ArrowDownRight size={13} /> {closest.toFixed(1)} km
            </span>
            <span>closest settlement</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>REGION CONDITIONS</span>
            <span className="ember-stat-icon ember-icon-green">
              <Wind size={16} />
            </span>
          </div>
          <div className="ember-stat-weather">
            <strong>Elevated</strong>
            <span className="ember-weather-dot" />
          </div>
          <div className="ember-stat-foot">
            <span className="ember-change ember-neutral">WIND 18 MPH</span>
            <span>ENE · 12% humidity</span>
          </div>
        </article>
      </section>

      <section className="ember-map-section" id="map">
        <div className="ember-section-heading">
          <div>
            <h2>Regional overview</h2>
            <p>
              Bukidnon, Mindanao <span>·</span> Philippines
            </p>
          </div>
          <div className="ember-map-heading-actions">
            <div className="ember-window-selector" aria-label="Data source">
              <button
                type="button"
                aria-pressed={!live}
                className={!live ? "selected" : ""}
                onClick={() => setLive(false)}
              >
                SAMPLE
              </button>
              <button
                type="button"
                aria-pressed={live}
                className={live ? "selected" : ""}
                onClick={() => setLive(true)}
              >
                {firmsQuery.isFetching ? "LOADING" : "LIVE"}
              </button>
            </div>
            <div className="ember-window-selector" aria-label="Sensor layers">
              <button
                type="button"
                aria-pressed={showViirs}
                className={showViirs ? "selected" : ""}
                onClick={() => setShowViirs(!showViirs)}
              >
                VIIRS
              </button>
              <button
                type="button"
                aria-pressed={showModis}
                className={showModis ? "selected" : ""}
                onClick={() => setShowModis(!showModis)}
              >
                MODIS
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ember-layer-button"
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              <SlidersHorizontal size={14} /> Layers
            </Button>
          </div>
        </div>
        <div className="ember-map-layout">
          <div
            className="ember-map-canvas"
            role="img"
            aria-label="OpenStreetMap-based thermal anomaly map of Bukidnon, Mindanao"
          >
            <EmberMap
              incidents={visibleHotspots.map((h) => ({
                name: h.name,
                count: h.count,
                severity: SEVERITY_OF[h.confidence],
                lat: h.lat,
                lng: h.lng,
              }))}
              selected={Math.max(selectedIndex, 0)}
              onSelect={(index) => {
                const hotspot = visibleHotspots[index];
                if (hotspot) setSelectedId(hotspot.id);
              }}
              dark={dark}
              onReady={handleMapReady}
            />

            <div className="ember-map-search">
              <Search size={15} />
              <input
                aria-label="Search location"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search location or incident"
              />
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch("")}>
                  <X size={14} />
                </button>
              )}
              <kbd>⌘ K</kbd>
            </div>
            <div className="ember-map-tools">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Zoom in"
                onClick={() => mapRef.current?.zoomIn()}
              >
                <Plus size={17} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Zoom out"
                onClick={() => mapRef.current?.zoomOut()}
              >
                <Minus size={17} />
              </Button>
              <span />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Center map"
                onClick={() =>
                  mapRef.current?.panTo([
                    selectedHotspot?.lat ?? 7.95,
                    selectedHotspot?.lng ?? 125.05,
                  ])
                }
              >
                <LocateFixed size={16} />
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ember-fullscreen"
              aria-label="Expand map"
              onClick={() =>
                document.querySelector(".ember-map-canvas")?.classList.toggle("map-expanded")
              }
            >
              <Maximize2 size={15} />
            </Button>
            {filtersOpen && (
              <div className="ember-layer-popover">
                <div>
                  <b>Map layers</b>
                  <button aria-label="Close layers" onClick={() => setFiltersOpen(false)}>
                    <X size={14} />
                  </button>
                </div>
                {["Thermal anomalies", "Settlement proximity", "Detection heatmap"].map((layer) => (
                  <button
                    type="button"
                    className="ember-layer-option"
                    key={layer}
                    onClick={() => setSelectedLayer(layer)}
                  >
                    <span>{layer}</span>
                    <span
                      className={`ember-layer-check ${selectedLayer === layer ? "checked" : ""}`}
                    >
                      {selectedLayer === layer && <Check size={12} />}
                    </span>
                  </button>
                ))}
                <div className="ember-layer-divider" />
                <label className="ember-confidence-label">CONFIDENCE</label>
                <div className="ember-confidence-options">
                  {[
                    { value: "all", label: "All confidence" },
                    { value: "high", label: "High" },
                    { value: "medium", label: "Medium" },
                    { value: "low", label: "Low" },
                  ].map((item) => (
                    <button
                      type="button"
                      aria-pressed={confidence === item.value}
                      className={confidence === item.value ? "selected" : ""}
                      key={item.value}
                      onClick={() => setConfidence(item.value as "all" | Confidence)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="ember-map-legend">
              <span className="ember-legend-title">DETECTION DENSITY</span>
              <div className="ember-legend-scale">
                <i />
                <i />
                <i />
                <i />
                <i />
                <span>Low</span>
                <span>High</span>
              </div>
              <div className="ember-legend-divider" />
              <div className="ember-legend-settlement">
                <MapPin size={12} /> Settlement{" "}
                <span className="ember-settlement-distance">&lt; 10 km</span>
              </div>
            </div>
            <div className="ember-map-compass">
              N<span>↑</span>
            </div>
          </div>

          <aside className="ember-incident-panel" id="incidents">
            <div className="ember-panel-header">
              <div>
                <div className="ember-panel-title">
                  Priority clusters{" "}
                  <span>{visibleHotspots.length.toString().padStart(2, "0")}</span>
                </div>
                <p>Ranked by proximity &amp; confidence</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Incident options"
                className="ember-panel-menu"
              >
                <MoreHorizontal size={18} />
              </Button>
            </div>
            <div className="ember-sort-label">
              <span>NEAREST SETTLEMENT</span>
              <ArrowDownRight size={13} />
            </div>
            <div className="ember-incident-list">
              {visibleHotspots.map((hotspot) => {
                const active = selectedHotspot?.id === hotspot.id;
                return (
                  <button
                    type="button"
                    className={`ember-incident-row ${active ? "active" : ""}`}
                    key={hotspot.id}
                    onClick={() => setSelectedId(hotspot.id)}
                  >
                    <span
                      className={`ember-incident-indicator indicator-${SEVERITY_OF[hotspot.confidence]}`}
                    >
                      <Flame size={14} />
                    </span>
                    <span className="ember-incident-copy">
                      <span className="ember-incident-name">
                        {hotspot.name}
                        <i
                          className={
                            hotspot.confidence === "high" ? "confidence-high" : "confidence-nominal"
                          }
                        >
                          {BADGE_OF[hotspot.confidence]}
                        </i>
                      </span>
                      <span className="ember-incident-area">{hotspot.municipality}, Bukidnon</span>
                      <span className="ember-incident-meta">
                        {hotspot.acqTime}
                        <span>·</span>
                        {hotspot.count} detections
                      </span>
                    </span>
                    <span className="ember-incident-distance">
                      <b>{hotspot.proximityKm.toFixed(1)} km</b>
                      <small>from town</small>
                    </span>
                  </button>
                );
              })}
              {visibleHotspots.length === 0 && (
                <div className="ember-no-results">No clusters match this search.</div>
              )}
            </div>
            <Link href="/detections" className="ember-view-incidents">
              View all incidents <ChevronRight size={15} />
            </Link>
            {selectedHotspot && (
              <div className="ember-selected-detail">
                <div className="ember-detail-kicker">
                  <Sparkles size={13} /> SELECTED CLUSTER
                </div>
                <div className="ember-detail-title">
                  {selectedHotspot.name}
                  <span className="ember-detail-status">
                    {BADGE_OF[selectedHotspot.confidence]} confidence
                  </span>
                </div>
                <p>
                  {selectedHotspot.settlement} · {selectedHotspot.proximityKm.toFixed(1)} km from
                  nearest settlement
                </p>
                <div className="ember-detail-stats">
                  <span>
                    <b>{selectedHotspot.count}</b> thermal pixels
                  </span>
                  <span>
                    <Radio size={13} /> {selectedHotspot.source} · {selectedHotspot.brightness} K
                  </span>
                </div>
                <p style={{ marginTop: "8px" }}>
                  POINT({selectedHotspot.lng} {selectedHotspot.lat}) · SRID 4326
                </p>
              </div>
            )}
          </aside>
        </div>
        <div className="ember-timeline">
          <div className="ember-timeline-label">
            <span>
              <span className="ember-timeline-live" /> 7-DAY TIMELINE
            </span>
            <span className="ember-timeline-date">
              {dayCursor === 0 ? "Today (Live)" : `${Math.abs(dayCursor)}d ago`}
            </span>
          </div>
          <div
            className="ember-timeline-chart"
            style={{ display: "flex", alignItems: "center", gap: "12px" }}
          >
            <span className="ember-time-mark">-6d</span>
            <input
              type="range"
              min={-6}
              max={0}
              step={1}
              value={dayCursor}
              onChange={(event) => setDayCursor(Number(event.target.value))}
              aria-label="Detection timeline day"
              style={{ flex: 1, accentColor: "var(--primary)" }}
            />
            <span className="ember-time-mark">Live</span>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="ember-play-button"
            aria-label={playing ? "Pause timeline" : "Play timeline"}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </Button>
        </div>
      </section>

      <section className="ember-bottom-strip">
        <div>
          <span className="ember-bottom-icon">
            <Flame size={16} />
          </span>
          <span>
            <b>{live ? "Live NASA FIRMS detections" : "Illustrative sample detections"}</b>
            <small>
              {live
                ? firmsQuery.isError
                  ? "Live feed failed, showing sample data"
                  : `${firmsQuery.data?.length ?? 0} live hotspots · Bukidnon bbox`
                : "Live NASA FIRMS feed is not connected"}
            </small>
          </span>
        </div>
        <div className="ember-bottom-right">
          <span>
            <span className="ember-pulse-dot" /> Demo environment
          </span>
          <button aria-label="More system status">
            <MoreHorizontal size={17} />
          </button>
        </div>
      </section>
      <footer className="ember-footer">
        <span>
          EMBER <i>·</i> EARLY RESPONSE MONITORING
        </span>
        <span>
          Thermal anomalies are indicators, not confirmed fires.{" "}
          <Link href="/detections">
            Learn about confidence scores <ChevronRight size={12} />
          </Link>
        </span>
      </footer>
    </EmberShell>
  );
}
