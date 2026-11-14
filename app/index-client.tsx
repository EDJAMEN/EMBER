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
  Droplets,
  Globe,
  Layers,
  Satellite,
  Map as MapIcon,
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
  Thermometer,
  Wind,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
const EmberMap = dynamic(() => import("@/components/ember-map").then((m) => m.EmberMap), {
  ssr: false,
});
import { SmartActionGuide } from "@/components/smart-action-guide";
import { PlaceCombobox } from "@/components/place-combobox";
import { DEFAULT_PLACE, type GuidePlace } from "@/lib/geocode";
import { conditionsKey, fetchConditions } from "@/lib/conditions";
import { heatIndexC, heatLevel } from "@/lib/action-guide";
import { clipToBoundary, contourAreas, fetchHeatGrid, gridDomain } from "@/lib/heat-grid";
import type { BoundaryPayload } from "@/app/api/boundary/route";
import { ClimatePanel, HeatScaleSlider } from "@/components/climate-panel";
import { useTheme } from "@/hooks/use-theme";
import { HOTSPOTS, type Confidence, type Hotspot } from "@/lib/hotspots";
import { EmberShell, type EmberLiveStatus } from "@/components/ember-shell";
import type { EmberMapInstance, EmberMapLayers } from "@/components/ember-map";
import {
  clusterHotspots,
  fetchFirmsWfsHotspots,
  type ClusteredHotspot,
} from "@/lib/firms-client";

const NO_HOTSPOTS: Hotspot[] = []; // stable empty list so memoized map data doesn't change every render

type OverviewView = "fires" | "temperature" | "heatindex";
type MapView = "globe" | "mercator"; // 3D globe or flat map projection
const VIEWS: OverviewView[] = ["fires", "temperature", "heatindex"];
const MAP_SEARCH_ID = "ember-map-search-input";
const OVERVIEW_STORAGE_KEY = "ember.overview.v1";

function readSavedOverview(): { place?: GuidePlace; view?: OverviewView; mapView?: MapView; realistic?: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(OVERVIEW_STORAGE_KEY) ?? "null") as {
      place?: Partial<GuidePlace> | null;
      view?: unknown;
      mapView?: unknown;
      realistic?: unknown;
    } | null;
    const p = saved?.place;
    const validPlace =
      p &&
      typeof p.name === "string" &&
      typeof p.region === "string" &&
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      Math.abs(p.lat!) <= 90 &&
      Math.abs(p.lng!) <= 180;
    return {
      place: validPlace ? (p as GuidePlace) : undefined,
      view: VIEWS.includes(saved?.view as OverviewView) ? (saved!.view as OverviewView) : undefined,
      mapView: saved?.mapView === "globe" || saved?.mapView === "mercator" ? saved.mapView : undefined,
      realistic: typeof saved?.realistic === "boolean" ? saved.realistic : undefined,
    };
  } catch {
    return {};
  }
}

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

const TOWN_COORDS: Record<string, { lat: number; lng: number }> = {
  "Malaybalay City": { lat: 8.1575, lng: 125.1278 },
  "Valencia City": { lat: 7.9043, lng: 125.092 },
  Maramag: { lat: 7.7583, lng: 125.0065 },
  "Manolo Fortich": { lat: 8.3677, lng: 124.8665 },
  Quezon: { lat: 7.7306, lng: 125.104 },
  Impasugong: { lat: 8.3011, lng: 125.0061 },
  "Don Carlos": { lat: 7.7208, lng: 124.9989 },
};

function getManilaGreeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  if (hour < 12) return "Good morning, team";
  if (hour < 18) return "Good afternoon, team";
  return "Good evening, team";
}

export function EmberDashboard() {
  const { dark } = useTheme();
  const mapRef = useRef<EmberMapInstance | null>(null);
  const [greeting, setGreeting] = useState("Good morning, team");
  useEffect(() => {
    setGreeting(getManilaGreeting());
  }, []);
  const handleMapReady = useCallback((map: EmberMapInstance) => {
    mapRef.current = map;
  }, []);
  // null = default monitored region (Bukidnon); set = any searched/located/clicked place on Earth.
  const [place, setPlace] = useState<GuidePlace | null>(null);
  const [view, setView] = useState<OverviewView>("fires");
  const [mapView, setMapView] = useState<MapView>("globe");
  // blueMarble on = "Realistic" (NASA GIBS satellite imagery); off = "Normal" vector basemap.
  const [layers, setLayers] = useState<EmberMapLayers>({
    blueMarble: false,
    countryBorders: true,
    firmsWms: true,
    clusteredHotspots: true,
  });
  const [restored, setRestored] = useState(false);
  const handleLocate = useCallback((place: GuidePlace) => {
    setPlace(place);
    setLive(true);
    setDayCursor(0);
  }, []);

  // Survive a refresh: restore the last place + view, then keep them saved (per-browser convenience only).
  useEffect(() => {
    const saved = readSavedOverview();
    if (saved.place) handleLocate(saved.place);
    if (saved.view) setView(saved.view);
    if (saved.mapView) setMapView(saved.mapView);
    if (saved.realistic !== undefined) setLayers((prev) => ({ ...prev, blueMarble: saved.realistic! }));
    setRestored(true);
  }, [handleLocate]);
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(
        OVERVIEW_STORAGE_KEY,
        JSON.stringify({ place, view, mapView, realistic: layers.blueMarble }),
      );
    } catch {
      // storage blocked (private mode etc.) — the page still works, it just won't remember
    }
  }, [place, view, mapView, layers.blueMarble, restored]);

  const climate = view !== "fires"; // temperature or heat-index view
  const focusPlace = place ?? (climate ? DEFAULT_PLACE : null);
  const conditionsQuery = useQuery({
    queryKey: conditionsKey(focusPlace?.lat ?? 0, focusPlace?.lng ?? 0),
    queryFn: () => fetchConditions(focusPlace!.lat, focusPlace!.lng),
    enabled: climate && focusPlace !== null,
    staleTime: 10 * 60 * 1000,
  });
  const gridQuery = useQuery({
    queryKey: ["heat-grid", focusPlace?.lat ?? 0, focusPlace?.lng ?? 0],
    queryFn: () => fetchHeatGrid(focusPlace!.lat, focusPlace!.lng),
    enabled: climate && focusPlace !== null,
    staleTime: 30 * 60 * 1000,
  });
  const temp = conditionsQuery.data;
  const heatIdx = temp?.tempC != null && temp.humidity != null ? heatIndexC(temp.tempC, temp.humidity) : null;
  const heat = heatIdx === null ? "None" : heatLevel(heatIdx);
  const maxHi = temp?.maxHeatIndexC ?? null;
  const gridCells = gridQuery.data;
  const metric = view === "temperature" ? "tempC" : "maxHeatIndexC";
  const domain = useMemo(() => (climate && gridCells ? gridDomain(gridCells, metric) : null), [climate, gridCells, metric]);
  // Slider selection; null = the full range of values around the place.
  const [tempRange, setTempRange] = useState<[number, number] | null>(null);
  useEffect(() => setTempRange(null), [domain]); // new place or metric → show everything again
  const range: [number, number] | null = domain
    ? [
        Math.max(domain[0], Math.min(tempRange?.[0] ?? domain[0], domain[1])),
        Math.min(domain[1], Math.max(tempRange?.[1] ?? domain[1], domain[0])),
      ]
    : null;
  const rangeLo = range?.[0];
  const rangeHi = range?.[1];
  // Border of the place (e.g. Valencia City) so the heat areas cover that place only.
  const boundaryQuery = useQuery({
    queryKey: ["boundary", focusPlace?.lat.toFixed(3), focusPlace?.lng.toFixed(3)],
    queryFn: async (): Promise<BoundaryPayload> => {
      const res = await fetch(`/api/boundary?lat=${focusPlace!.lat}&lng=${focusPlace!.lng}`);
      if (!res.ok) throw new Error(`boundary ${res.status}`);
      return res.json();
    },
    enabled: climate && focusPlace !== null,
    staleTime: Infinity, // borders don't change
    retry: 1,
  });
  const boundary = boundaryQuery.data?.geometry ?? null;
  const boundaryName = boundaryQuery.data?.name ?? null;
  const contours = useMemo(() => {
    if (!gridCells || rangeLo === undefined || rangeHi === undefined) return null;
    if (boundaryQuery.isLoading) return null; // wait, so the unclipped areas don't flash first
    const all = contourAreas(gridCells, metric, rangeLo, rangeHi);
    // No border found (open sea, unmapped area, lookup failed): fall back to the surrounding area.
    return boundary ? clipToBoundary(all.areas, boundary) : all;
  }, [gridCells, metric, rangeLo, rangeHi, boundary, boundaryQuery.isLoading]);
  const [confidence, setConfidence] = useState<"all" | Confidence>("all");
  const [showViirs, setShowViirs] = useState(true);
  const [showModis, setShowModis] = useState(true);
  const [dayCursor, setDayCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState(false);
  const [bbox, setBbox] = useState<[number, number, number, number]>([7.3, 124.5, 8.6, 125.5]);
  const wfsWindow: "24h" | "7d" = dayCursor < 0 ? "7d" : "24h";
  const effectiveBbox: [number, number, number, number] = place
    ? [place.lat - 0.5, place.lng - 0.5, place.lat + 0.5, place.lng + 0.5]
    : bbox;
  const bboxKey = effectiveBbox.map((n) => n.toFixed(2)).join(",");
  const firmsQuery = useQuery({
    queryKey: ["firms-wfs", wfsWindow, bboxKey],
    queryFn: () => fetchFirmsWfsHotspots({ bbox: effectiveBbox, window: wfsWindow }),
    enabled: live,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
  const isLiveFeedActive = live && Boolean(firmsQuery.data);
  const regionLabel = place ? [place.name, place.region].filter(Boolean).join(" · ") : "Bukidnon, Mindanao · Philippines";
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

  const visibleHotspots: ClusteredHotspot[] = useMemo(() => {
    const query = search.toLowerCase();
    const matchesFilter = (hotspot: Hotspot) => {
      if (confidence !== "all" && hotspot.confidence !== confidence) return false;
      const sensors = hotspot.sources ?? [hotspot.source];
      if (!sensors.some((s) => (s === "VIIRS" ? showViirs : showModis))) return false;
      if (hotspot.dayOffset > dayCursor || hotspot.dayOffset < dayCursor - 1) return false;
      if (
        query &&
        !`${hotspot.name} ${hotspot.settlement} ${hotspot.municipality}`
          .toLowerCase()
          .includes(query)
      )
        return false;
      return true;
    };

    if (isLiveFeedActive && firmsQuery.data) {
      return clusterHotspots(firmsQuery.data.data.filter(matchesFilter));
    }

    const fallback = place ? NO_HOTSPOTS : HOTSPOTS;
    return fallback.filter(matchesFilter).map((h) => ({
      ...h,
      highConfidenceCount: h.confidence === "high" ? 1 : 0,
    }));
  }, [confidence, showViirs, showModis, dayCursor, search, isLiveFeedActive, firmsQuery.data, place]);

  // Memoized: a new array every render would re-run the map's marker/pan effect and cut off fly-to animations.
  const mapIncidents = useMemo(
    () =>
      climate
        ? []
        : visibleHotspots.map((h) => {
            const town = TOWN_COORDS[h.municipality];
            return {
              name: h.name,
              count: h.count,
              severity: SEVERITY_OF[h.confidence],
              lat: h.lat,
              lng: h.lng,
              sources: h.sources,
              footprint: h.geoJsonPolygon,
              proximityKm: h.proximityKm,
              settlementLat: town?.lat,
              settlementLng: town?.lng,
              settlementName: h.settlement,
            };
          }),
    [visibleHotspots, climate],
  );
  const pinLabel = !focusPlace
    ? ""
    : view === "temperature"
      ? `${focusPlace.name} · ${temp?.tempC != null ? `${Math.round(temp.tempC)}°C` : "…"}`
      : view === "heatindex"
        ? `${focusPlace.name} · HI ${maxHi !== null ? `${Math.round(maxHi)}°C` : "…"}`
        : focusPlace.name;
  const selectedHotspot = visibleHotspots.find((h) => h.id === selectedId) ?? visibleHotspots[0];
  const weatherLat = place?.lat ?? selectedHotspot?.lat ?? DEFAULT_PLACE.lat;
  const weatherLng = place?.lng ?? selectedHotspot?.lng ?? DEFAULT_PLACE.lng;
  const liveWeatherQuery = useQuery({
    queryKey: ["open-meteo-current", weatherLat.toFixed(3), weatherLng.toFixed(3)],
    queryFn: async () => {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${weatherLat}&longitude=${weatherLng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_direction_10m`,
      );
      if (!res.ok) throw new Error("Open-Meteo unavailable");
      const json = (await res.json()) as {
        current?: {
          temperature_2m?: number;
          relative_humidity_2m?: number;
          apparent_temperature?: number;
          wind_speed_10m?: number;
          wind_direction_10m?: number;
        };
      };
      return json.current ?? null;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const liveWeather = liveWeatherQuery.data;
  const windMph =
    liveWeather?.wind_speed_10m != null ? Math.round(liveWeather.wind_speed_10m * 0.621371) : null;
  const windCardinal =
    liveWeather?.wind_direction_10m != null
      ? ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][
          Math.round(liveWeather.wind_direction_10m / 22.5) % 16
        ]
      : null;
  const humidityPct =
    liveWeather?.relative_humidity_2m != null ? Math.round(liveWeather.relative_humidity_2m) : null;
  const selectedIndex = selectedHotspot ? visibleHotspots.indexOf(selectedHotspot) : 0;
  const activeCount = isLiveFeedActive
    ? visibleHotspots.reduce((sum, h) => sum + h.count, 0)
    : visibleHotspots.length;
  const highCount = isLiveFeedActive
    ? visibleHotspots.reduce((sum, h) => sum + h.highConfidenceCount, 0)
    : visibleHotspots.filter((h) => h.confidence === "high").length;
  const closest = visibleHotspots.reduce(
    (min, h) => Math.min(min, h.proximityKm),
    visibleHotspots[0]?.proximityKm ?? 0,
  );

  const liveStatus: EmberLiveStatus = useMemo(() => {
    if (!live) return { mode: "sample", state: "idle" };
    if (firmsQuery.isFetching) return { mode: "live", state: "loading" };
    if (firmsQuery.isError) {
      return {
        mode: "live",
        state: "error",
        errorMessage: firmsQuery.error instanceof Error ? firmsQuery.error.message : "Sync failed",
      };
    }
    const fetchedAt = firmsQuery.data?.fetchedAt;
    const formattedTime = fetchedAt
      ? new Date(fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : undefined;
    return {
      mode: "live",
      state: firmsQuery.data ? "synced" : "idle",
      lastSync: formattedTime,
      region: firmsQuery.data?.region,
    };
  }, [live, firmsQuery.isFetching, firmsQuery.isError, firmsQuery.error, firmsQuery.data]);

  return (
    <EmberShell active="overview" title="Overview" liveStatus={liveStatus}>
      <section className="ember-page-heading">
        <div>
          <div className="ember-eyebrow">
            <span /> FIELD OPERATIONS <span className="ember-eyebrow-date">/ NOV 13, 2026</span>
          </div>
          <h1>
            {greeting}<span>.</span>
          </h1>
          <p>Here’s the latest across your monitored region.</p>
        </div>
        <Button
          variant="outline"
          className="ember-export-button"
          onClick={() => {
            const c = selectedHotspot;
            const viirsCount = visibleHotspots.filter((h) => (h.sources ?? [h.source]).includes("VIIRS")).length;
            const modisCount = visibleHotspots.filter((h) => (h.sources ?? [h.source]).includes("MODIS")).length;
            const rows = [
              ["Field", "Value"],
              ["Generated At", new Date().toISOString()],
              ["Mode", live ? "LIVE FIRMS WFS" : "SAMPLE"],
              ["Region", regionLabel],
              ["Active Cluster", c?.name ?? "None"],
              ["Coordinates", c ? `POINT(${c.lng.toFixed(4)} ${c.lat.toFixed(4)}) · SRID 4326` : "N/A"],
              ["Proximity", c ? `${c.proximityKm.toFixed(1)} km to ${c.settlement}` : "N/A"],
              ["Sensors", `[${viirsCount}] VIIRS · [${modisCount}] MODIS`],
              ["Brightness (K)", c ? `${c.brightness.toFixed(1)} K` : "N/A"],
              ["Confidence", c ? BADGE_OF[c.confidence] : "N/A"],
              ["Active Detections", String(activeCount)],
              ["High Confidence", String(highCount)],
            ];
            const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `ember-briefing-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Radio size={15} /> Export briefing
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
            <strong>
              {humidityPct !== null ? (humidityPct < 45 ? "Elevated" : humidityPct < 70 ? "Moderate" : "Low") : "Elevated"}
            </strong>
            <span className="ember-weather-dot" />
          </div>
          <div className="ember-stat-foot">
            <span className="ember-change ember-neutral">
              {windMph !== null ? `WIND ${windMph} MPH` : "WIND -- MPH"}
            </span>
            <span>
              {windCardinal ?? "--"} · {humidityPct !== null ? `${humidityPct}%` : "--%"} humidity
            </span>
          </div>
        </article>
      </section>

      <section className="ember-map-section" id="map">
        <div className="ember-section-heading">
          <div>
            <h2>Regional overview</h2>
            <p>{regionLabel}</p>
          </div>
          <div className="ember-map-heading-actions">
            <div className="ember-window-selector" role="radiogroup" aria-label="Map view">
              {(
                [
                  ["globe", "GLOBE", Globe],
                  ["mercator", "FLAT", MapIcon],
                ] as const
              ).map(([key, label, Icon]) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={mapView === key}
                  key={key}
                  className={mapView === key ? "selected" : ""}
                  onClick={() => setMapView(key)}
                  title={key === "globe" ? "3D globe view" : "Flat map view"}
                >
                  <Icon size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {label}
                </button>
              ))}
            </div>
            <div className="ember-window-selector" role="radiogroup" aria-label="Map style">
              {(
                [
                  [false, "NORMAL", Layers, "Normal map: streets, labels and 3D buildings"],
                  [true, "REALISTIC", Satellite, "Realistic: NASA GIBS Blue Marble satellite imagery"],
                ] as const
              ).map(([realistic, label, Icon, title]) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={layers.blueMarble === realistic}
                  key={label}
                  className={layers.blueMarble === realistic ? "selected" : ""}
                  onClick={() => setLayers((prev) => ({ ...prev, blueMarble: realistic }))}
                  title={title}
                >
                  <Icon size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Location: ${focusPlace?.name ?? "Bukidnon region"}. Search a place`}
              title="Search a place"
              onClick={() => {
                const input = document.getElementById(MAP_SEARCH_ID);
                input?.scrollIntoView({ block: "center", behavior: "smooth" });
                input?.focus({ preventScroll: true });
              }}
            >
              <MapPin size={14} /> LOCATION
              <span style={{ fontWeight: 400, opacity: 0.75, maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {focusPlace?.name ?? "Bukidnon"}
              </span>
            </Button>
            {view === "fires" && (
            <>
            <div className="ember-window-selector" aria-label="Data source">
              <button
                type="button"
                aria-pressed={!live}
                className={!live ? "selected" : ""}
                onClick={() => {
                  setLive(false);
                  setPlace(null); // back to the Bukidnon sample region
                }}
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
            </>
            )}
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
            aria-label={`OpenStreetMap-based thermal anomaly map of ${regionLabel}`}
          >
            <EmberMap
              incidents={mapIncidents}
              selected={Math.max(selectedIndex, 0)}
              onSelect={(index) => {
                const hotspot = visibleHotspots[index];
                if (hotspot) setSelectedId(hotspot.id);
              }}
              dark={dark}
              onReady={handleMapReady}
              layers={layers}
              showViirs={showViirs}
              showModis={showModis}
              onBoundsChange={setBbox}
              projection={mapView}
              focus={focusPlace ? { lat: focusPlace.lat, lng: focusPlace.lng, label: pinLabel } : null}
              areas={climate ? (contours?.areas ?? null) : null}
              outline={climate ? boundary : null}
              onMapClick={
                climate
                  ? (lat, lng) =>
                      handleLocate({ name: "Selected point", region: `${lat.toFixed(3)}, ${lng.toFixed(3)}`, lat, lng })
                  : undefined
              }
            />

            <PlaceCombobox
              inputId={MAP_SEARCH_ID}
              className="ember-map-search"
              label="Search any place or filter incidents"
              placeholder="Search any place or incident"
              value={search}
              onChange={setSearch}
              onPick={(picked) => {
                setSearch("");
                handleLocate(picked);
              }}
              before={<Search size={15} />}
              after={
                <>
                  {search && (
                    <button aria-label="Clear search" onClick={() => setSearch("")}>
                      <X size={14} />
                    </button>
                  )}
                  <kbd>⌘ K</kbd>
                </>
              }
            />
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
                    // MapLibre takes [lng, lat]
                    selectedHotspot?.lng ?? 125.05,
                    selectedHotspot?.lat ?? 7.95,
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
                {(
                  [
                    { key: "blueMarble", label: "Blue Marble" },
                    { key: "countryBorders", label: "Country Borders" },
                    { key: "firmsWms", label: "FIRMS WMS Raster Dots" },
                    { key: "clusteredHotspots", label: "Clustered Hotspots" },
                  ] as const
                ).map((item) => {
                  const checked = layers[item.key];
                  return (
                    <button
                      type="button"
                      className="ember-layer-option"
                      key={item.key}
                      aria-pressed={checked}
                      onClick={() =>
                        setLayers((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                      }
                    >
                      <span>{item.label}</span>
                      <span className={`ember-layer-check ${checked ? "checked" : ""}`}>
                        {checked && <Check size={12} />}
                      </span>
                    </button>
                  );
                })}
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
            {climate ? (
              <div className="ember-map-legend" style={{ width: "min(380px, calc(100% - 90px))" }}>
                <HeatScaleSlider
                  title={view === "temperature" ? "Temperature" : "Max Heat Index"}
                  range={range}
                  domain={domain}
                  onRangeChange={setTempRange}
                />
              </div>
            ) : (
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
            )}
            <div className="ember-map-compass">
              N<span>↑</span>
            </div>
          </div>

          <aside className="ember-incident-panel" id="incidents">
            <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
              <div className="ember-sort-label" style={{ padding: 0, marginBottom: "8px" }}>
                <span>SHOW ON MAP</span>
              </div>
              <div className="ember-window-selector" role="radiogroup" aria-label="What to show on the map" style={{ width: "100%", display: "flex" }}>
                {(
                  [
                    ["fires", "Wildfires", Flame],
                    ["temperature", "Temperature", Thermometer],
                    ["heatindex", "Heat index", Droplets],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={view === key}
                    key={key}
                    className={view === key ? "selected" : ""}
                    onClick={() => setView(key)}
                    style={{ flex: 1 }}
                  >
                    <Icon size={12} style={{ display: "inline", verticalAlign: "-2px" }} /> {label}
                  </button>
                ))}
              </div>
            </div>
            {climate && focusPlace ? (
              <ClimatePanel
                view={view as "temperature" | "heatindex"}
                place={focusPlace}
                conditions={temp}
                error={conditionsQuery.isError}
                heatIndexNow={heatIdx}
                heat={heat}
                domain={domain}
                range={range}
                onRangeChange={setTempRange}
                coverage={contours?.coverage ?? null}
                areasLoading={gridQuery.isLoading || boundaryQuery.isLoading}
                coverageOf={boundary ? (boundaryName ?? focusPlace.name) : null}
              />
            ) : (
              <>
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
                      <span className="ember-incident-area">{place ? `${hotspot.proximityKm.toFixed(1)} km from ${place.name}` : `${hotspot.municipality}, Bukidnon`}</span>
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
                    {selectedHotspot.fusedConfidencePercent !== undefined &&
                      ` · ${selectedHotspot.fusedConfidencePercent}%`}
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
                    <Radio size={13} />{" "}
                    {(selectedHotspot.sources ?? [selectedHotspot.source]).join(" + ")} ·{" "}
                    {selectedHotspot.brightness} K
                    {selectedHotspot.frp !== undefined && ` · ${selectedHotspot.frp} MW`}
                  </span>
                </div>
                <p style={{ marginTop: "8px" }}>
                  POINT({selectedHotspot.lng} {selectedHotspot.lat}) · SRID 4326
                </p>
              </div>
            )}
              </>
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
        <SmartActionGuide place={place ?? DEFAULT_PLACE} onLocate={handleLocate} />
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
                  : `${firmsQuery.data?.rawCount ?? 0} live detections · ${place ? `~55 km around ${place.name}` : firmsQuery.data?.region === "Global" ? "Global" : "SouthEast_Asia"}`
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
