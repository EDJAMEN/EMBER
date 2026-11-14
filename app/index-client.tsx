"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
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
import type { BoundaryPayload, LevelsPayload } from "@/app/api/boundary/route";
import { ClimatePanel, HeatScaleSlider } from "@/components/climate-panel";
import { useTheme } from "@/hooks/use-theme";
import { booleanPointInPolygon, pointToPolygonDistance } from "@turf/turf";
import { NEARBY_KM, splitByBorder } from "@/lib/fire-area";
import { HOTSPOTS, type Confidence, type Hotspot } from "@/lib/hotspots";
import { WIND_SCALE, compassOf, fetchFireWinds, fetchWindField, keepBox, sampleWind, spreadEllipse, spreadFeatures } from "@/lib/wind";
import { EmberShell, type EmberLiveStatus } from "@/components/ember-shell";
import type { EmberMapInstance, EmberMapLayers } from "@/components/ember-map";
import {
  clusterHotspots,
  computeHarmonizationStats,
  fetchFirmsWfsHotspots,
  unharmonizedHotspots,
  type ClusteredHotspot,
} from "@/lib/firms-client";
import { HistoricalFireNavigator } from "@/components/historical-fire-navigator";
import { formatShortDate } from "@/lib/historical-fires";
import {
  buildTimelineSteps,
  hotspotMatchesStep,
  type Granularity,
  type QuickRange,
  type SpanDays,
} from "@/lib/timeline";

const NO_HOTSPOTS: Hotspot[] = []; // stable empty list so memoized map data doesn't change every render

type OverviewView = "fires" | "temperature" | "heatindex";
type MapView = "globe" | "mercator"; // 3D globe or flat map projection
const VIEWS: OverviewView[] = ["fires", "temperature", "heatindex"];
const MAP_SEARCH_ID = "ember-map-search-input";
const OVERVIEW_STORAGE_KEY = "ember.overview.v1";

function readSavedOverview(): { place?: GuidePlace; view?: OverviewView; mapView?: MapView; realistic?: boolean; adminLevel?: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(OVERVIEW_STORAGE_KEY) ?? "null") as {
      place?: Partial<GuidePlace> | null;
      view?: unknown;
      mapView?: unknown;
      realistic?: unknown;
      adminLevel?: unknown;
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
      place: validPlace
        ? {
            name: p.name!,
            region: p.region!,
            lat: p.lat!,
            lng: p.lng!,
            osm: typeof p.osm === "string" && /^[NWR]\d{1,12}$/.test(p.osm) ? p.osm : undefined,
            kind: typeof p.kind === "string" ? p.kind.slice(0, 40) : undefined,
          }
        : undefined,
      view: VIEWS.includes(saved?.view as OverviewView) ? (saved!.view as OverviewView) : undefined,
      mapView: saved?.mapView === "globe" || saved?.mapView === "mercator" ? saved.mapView : undefined,
      realistic: typeof saved?.realistic === "boolean" ? saved.realistic : undefined,
      adminLevel: typeof saved?.adminLevel === "string" ? saved.adminLevel : undefined,
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

export function EmberDashboard() {
  const { dark } = useTheme();
  const mapRef = useRef<EmberMapInstance | null>(null);
  const handleMapReady = useCallback((map: EmberMapInstance) => {
    mapRef.current = map;
  }, []);
  // null = default monitored region (Bukidnon); set = any searched/located/clicked place on Earth.
  const [place, setPlace] = useState<GuidePlace | null>(null);
  const [view, setView] = useState<OverviewView>("fires");
  const [mapView, setMapView] = useState<MapView>("globe");
  // Preferred admin level for the climate views (e.g. "city", "state"); null = the place's default.
  const [adminLevel, setAdminLevel] = useState<string | null>(null);
  // blueMarble on = "Realistic" (NASA GIBS satellite imagery); off = "Normal" vector basemap.
  const [layers, setLayers] = useState<EmberMapLayers>({
    blueMarble: false,
    countryBorders: true,
    firmsWms: false, // optional (Layers): live markers + heatspots show the same fires without spending the key's quota
    clusteredHotspots: true,
  });
  const [restored, setRestored] = useState(false);
  const handleLocate = useCallback((place: GuidePlace) => {
    setPlace(place);
    setLive(true);
  }, []);

  // Survive a refresh: restore the last place + view, then keep them saved (per-browser convenience only).
  useEffect(() => {
    const saved = readSavedOverview();
    if (saved.place) handleLocate(saved.place);
    if (saved.view) setView(saved.view);
    if (saved.mapView) setMapView(saved.mapView);
    if (saved.realistic !== undefined) setLayers((prev) => ({ ...prev, blueMarble: saved.realistic! }));
    if (saved.adminLevel) setAdminLevel(saved.adminLevel);
    setRestored(true);
  }, [handleLocate]);
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(
        OVERVIEW_STORAGE_KEY,
        JSON.stringify({ place, view, mapView, realistic: layers.blueMarble, adminLevel }),
      );
    } catch {
      // storage blocked (private mode etc.) — the page still works, it just won't remember
    }
  }, [place, view, mapView, layers.blueMarble, adminLevel, restored]);

  const climate = view !== "fires"; // temperature or heat-index view
  const focusPlace = place ?? (climate ? DEFAULT_PLACE : null);
  const conditionsQuery = useQuery({
    queryKey: conditionsKey(focusPlace?.lat ?? 0, focusPlace?.lng ?? 0),
    queryFn: () => fetchConditions(focusPlace!.lat, focusPlace!.lng),
    enabled: climate && focusPlace !== null,
    staleTime: 10 * 60 * 1000,
  });
  // The place's real admin hierarchy (country → region → province/state → … → village).
  const lat3 = focusPlace?.lat.toFixed(3);
  const lng3 = focusPlace?.lng.toFixed(3);
  const levelsQuery = useQuery({
    queryKey: ["admin-levels", lat3, lng3],
    queryFn: async (): Promise<LevelsPayload> => {
      const res = await fetch(`/api/boundary?lat=${focusPlace!.lat}&lng=${focusPlace!.lng}`);
      if (!res.ok) throw new Error(`levels ${res.status}`);
      return res.json();
    },
    enabled: focusPlace !== null, // wildfire view uses the same area as the climate views
    staleTime: Infinity, // admin areas don't change
    retry: 1,
  });
  const levels = levelsQuery.data?.levels ?? null;
  // A place picked from search (e.g. "Bukidnon" the province, "Texas" the state) IS the area to cover —
  // its exact OSM border — until the user picks a different level chip for that place.
  const placeKey = focusPlace ? `${focusPlace.lat},${focusPlace.lng}` : "";
  const [levelChosenFor, setLevelChosenFor] = useState<string | null>(null);
  const pickedArea = !!focusPlace?.osm && levelChosenFor !== placeKey;
  const chooseLevel = useCallback(
    (key: string) => {
      setAdminLevel(key);
      setLevelChosenFor(placeKey);
    },
    [placeKey],
  );
  const sameName = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
  // Picked area → highlight its own chip; otherwise the preferred level (carries over between places) or the default.
  const level = pickedArea
    ? (levels?.find((l) => sameName(l.name, focusPlace?.name)) ?? null)
    : (levels?.find((l) => l.key === adminLevel) ?? levels?.find((l) => l.key === levelsQuery.data?.defaultKey) ?? null);
  // Border of the chosen area so the heat areas cover exactly it (e.g. Valencia City, or all of Bukidnon).
  const boundaryQuery = useQuery({
    queryKey: pickedArea ? ["boundary-osm", focusPlace?.osm] : ["boundary", lat3, lng3, level?.key, level?.name],
    queryFn: async (): Promise<BoundaryPayload> => {
      const qs = new URLSearchParams({ lat: String(focusPlace!.lat), lng: String(focusPlace!.lng) });
      if (pickedArea) {
        qs.set("osm", focusPlace!.osm!);
        qs.set("kind", focusPlace!.kind ?? "");
      } else {
        qs.set("level", level!.key);
        qs.set("name", level!.name);
      }
      const res = await fetch(`/api/boundary?${qs}`);
      if (!res.ok) throw new Error(`boundary ${res.status}`);
      return res.json();
    },
    enabled: focusPlace !== null && (pickedArea || level !== null),
    staleTime: Infinity,
    retry: 1,
  });
  const boundary = boundaryQuery.data?.geometry ?? null;
  const boundaryBbox = boundaryQuery.data?.bbox ?? null;
  const boundaryName = boundaryQuery.data?.name ?? null;
  // The chosen level exists but has no mapped border (e.g. a barangay mapped only as a point):
  // cover nothing rather than an invented square, and say so.
  const borderMissing = (pickedArea || level !== null) && boundaryQuery.isSuccess && boundary === null;
  const missingName = pickedArea ? (focusPlace?.name ?? null) : (level?.name ?? null);
  // Wait for the border so the weather grid covers exactly the chosen area (a village, or a whole country).
  // Only when the lookups themselves fail (offline, open sea) fall back to ~100 km around the place.
  const borderReady = boundaryQuery.isError || (boundaryQuery.isSuccess && boundary !== null);
  const areaSettled = pickedArea
    ? borderReady
    : levelsQuery.isError || (levelsQuery.isSuccess && (!level || borderReady));
  const gridQuery = useQuery({
    queryKey: ["heat-grid", focusPlace?.lat ?? 0, focusPlace?.lng ?? 0, boundaryBbox?.join(",") ?? "point"],
    queryFn: () => fetchHeatGrid(focusPlace!.lat, focusPlace!.lng, boundaryBbox),
    enabled: climate && focusPlace !== null && areaSettled,
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
  // New place or metric → show everything again. (Not on data arrival, so a range set while loading is kept.)
  useEffect(() => setTempRange(null), [focusPlace?.lat, focusPlace?.lng, metric]);
  // Sliders stay usable without data: they span the whole legend scale until the area's own min–max is known.
  const sliderDomain: [number, number] = domain ?? [0, 55];
  const range: [number, number] = [
    Math.max(sliderDomain[0], Math.min(tempRange?.[0] ?? sliderDomain[0], sliderDomain[1])),
    Math.min(sliderDomain[1], Math.max(tempRange?.[1] ?? sliderDomain[1], sliderDomain[0])),
  ];
  const rangeLo = range?.[0];
  const rangeHi = range?.[1];
  const contours = useMemo(() => {
    if (borderMissing || !gridCells || rangeLo === undefined || rangeHi === undefined) return null;
    const all = contourAreas(gridCells, metric, rangeLo, rangeHi);
    // No border found (open sea, unmapped area, lookup failed): fall back to the surrounding area.
    return boundary ? clipToBoundary(all.areas, boundary) : all;
  }, [borderMissing, gridCells, metric, rangeLo, rangeHi, boundary]);
  const [confidence, setConfidence] = useState<"all" | Confidence>("all");
  const [showViirs, setShowViirs] = useState(true);
  const [showModis, setShowModis] = useState(true);
  const [harmonized, setHarmonized] = useState(true);
  const [todayStr] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [quickRange, setQuickRange] = useState<QuickRange | null>("today");
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [historicalDate, setHistoricalDate] = useState<string | null>(null);
  const [spanDays, setSpanDays] = useState<SpanDays>(1);
  const [scrubIndex, setScrubIndex] = useState<number>(1);
  const [playing, setPlaying] = useState(false);
  const [live, setLive] = useState(true); // real NASA FIRMS by default; sample data only on request
  const [bbox, setBbox] = useState<[number, number, number, number]>([7.3, 124.5, 8.6, 125.5]);

  const timelineModel = useMemo(
    () =>
      buildTimelineSteps({
        todayStr,
        historicalDate,
        spanDays,
        granularity,
        quickRange,
      }),
    [todayStr, historicalDate, spanDays, granularity, quickRange],
  );
  const clampedScrubIndex = Math.max(
    0,
    Math.min(Math.max(0, timelineModel.steps.length - 1), scrubIndex),
  );
  const activeStep = timelineModel.steps[clampedScrubIndex] ?? timelineModel.steps[0]!;
  const isHistoricalMode = timelineModel.isHistorical;
  const activeScrubDate = activeStep.date;
  const activeYear = Number(activeScrubDate.slice(0, 4));
  const isModisEraOnly = activeYear >= 2000 && activeYear <= 2011;
  const effectiveShowViirs = !isModisEraOnly && showViirs;

  const wfsWindow: "24h" | "7d" =
    spanDays > 1 || (quickRange !== "today" && quickRange !== "24h") ? "7d" : "24h";
  const effectiveSensorParam: "BOTH" | "VIIRS" | "MODIS" =
    effectiveShowViirs && showModis ? "BOTH" : effectiveShowViirs ? "VIIRS" : "MODIS";
  // Search the chosen area's extent plus ~NEARBY_KM around it ([minLat, minLon, maxLat, maxLon]), so fires just
  // outside the border (which the wind can push in) are known; ~55 km square only without a border.
  // shortcut: an area crossing the dateline is clamped at ±180°, so its far side is not searched; split the box if that matters.
  const effectiveBbox: [number, number, number, number] = place
    ? boundaryBbox
      ? [boundaryBbox[1] - NEARBY_KM / 111, boundaryBbox[0] - NEARBY_KM / 111, boundaryBbox[3] + NEARBY_KM / 111, boundaryBbox[2] + NEARBY_KM / 111]
      : [place.lat - 0.5, place.lng - 0.5, place.lat + 0.5, place.lng + 0.5]
    : bbox;
  const bboxKey = effectiveBbox.map((n) => n.toFixed(2)).join(",");
  const near = place ? { lat: place.lat, lng: place.lng, name: place.name } : null; // distances are from the searched point
  const firmsQuery = useQuery({
    queryKey: [
      "firms-wfs",
      wfsWindow,
      historicalDate ?? "live",
      spanDays,
      isModisEraOnly ? "MODIS" : "BOTH",
      bboxKey,
      near?.lat,
      near?.lng,
      near?.name,
    ],
    placeholderData: keepPreviousData, // zoom/pan/scrub: keep fires on screen while loading
    queryFn: () =>
      fetchFirmsWfsHotspots({
        bbox: effectiveBbox,
        window: wfsWindow,
        near,
        date: historicalDate ?? (spanDays > 7 ? timelineModel.startDate : null),
        days: historicalDate || spanDays > 7 ? spanDays : undefined,
        sensor: effectiveSensorParam,
      }),
    // Wait for the area's border, so the first request already covers the right area.
    enabled: (live || isHistoricalMode) && (!place || areaSettled || borderMissing),
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
  const isLiveFeedActive = (live || isHistoricalMode) && Boolean(firmsQuery.data);
  const regionLabel = place ? [place.name, place.region].filter(Boolean).join(" · ") : "Bukidnon, Mindanao · Philippines";
  const [selectedId, setSelectedId] = useState<number>(HOTSPOTS[0]?.id ?? 0);
  const [selectedLayer, setSelectedLayer] = useState("Thermal anomalies");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setScrubIndex((idx) => {
        if (idx >= timelineModel.steps.length - 1) {
          setPlaying(false);
          return idx;
        }
        return idx + 1;
      });
    }, granularity === "subdaily" ? 900 : 1200);
    return () => clearInterval(timer);
  }, [playing, timelineModel.steps.length, granularity]);

  const handleSelectQuickRange = useCallback(
    (next: QuickRange) => {
      const nextSpan: SpanDays = next === "7d" ? 7 : next === "3d" ? 3 : 1;
      const nextSteps = buildTimelineSteps({
        todayStr,
        historicalDate: null,
        spanDays: nextSpan,
        granularity,
        quickRange: next,
      }).steps;
      setQuickRange(next);
      setHistoricalDate(null);
      setSpanDays(nextSpan);
      setPlaying(false);
      setScrubIndex(Math.max(0, nextSteps.length - 1));
    },
    [todayStr, granularity],
  );

  const handleChangeGranularity = useCallback(
    (nextGran: Granularity) => {
      const prevMax = Math.max(1, timelineModel.steps.length - 1);
      const nextSteps = buildTimelineSteps({
        todayStr,
        historicalDate,
        spanDays,
        granularity: nextGran,
        quickRange,
      }).steps;
      const nextMax = Math.max(0, nextSteps.length - 1);
      setGranularity(nextGran);
      setPlaying(false);
      setScrubIndex(Math.round((clampedScrubIndex / prevMax) * nextMax));
      if (nextGran === "subdaily" && !climate) {
        setSpreadOn(true);
      }
    },
    [todayStr, historicalDate, spanDays, quickRange, timelineModel.steps.length, clampedScrubIndex, climate],
  );

  const handleSelectHistoricalDate = useCallback(
    (dateStr: string) => {
      const clamped = dateStr < "2000-11-01" ? "2000-11-01" : dateStr > todayStr ? todayStr : dateStr;
      if (clamped >= todayStr) {
        const nextSteps = buildTimelineSteps({
          todayStr,
          historicalDate: null,
          spanDays: 1,
          granularity,
          quickRange: "today",
        }).steps;
        setHistoricalDate(null);
        setQuickRange("today");
        setSpanDays(1);
        setPlaying(false);
        setScrubIndex(Math.max(0, nextSteps.length - 1));
        return;
      }
      setHistoricalDate(clamped);
      setQuickRange(null);
      setPlaying(false);
      setScrubIndex(0);
    },
    [todayStr, granularity],
  );

  const handleChangeSpanDays = useCallback(
    (nextSpan: SpanDays) => {
      const nextQuick: QuickRange | null = historicalDate
        ? null
        : nextSpan === 1
          ? "today"
          : nextSpan === 3
            ? "3d"
            : nextSpan === 7
              ? "7d"
              : null;
      const nextSteps = buildTimelineSteps({
        todayStr,
        historicalDate,
        spanDays: nextSpan,
        granularity,
        quickRange: nextQuick,
      }).steps;
      setSpanDays(nextSpan);
      setQuickRange(nextQuick);
      setPlaying(false);
      setScrubIndex(historicalDate ? 0 : Math.max(0, nextSteps.length - 1));
    },
    [todayStr, historicalDate, granularity],
  );

  const handleBackToLive = useCallback(() => {
    const nextSteps = buildTimelineSteps({
      todayStr,
      historicalDate: null,
      spanDays: 1,
      granularity,
      quickRange: "today",
    }).steps;
    setHistoricalDate(null);
    setQuickRange("today");
    setSpanDays(1);
    setPlaying(false);
    setScrubIndex(Math.max(0, nextSteps.length - 1));
  }, [todayStr, granularity]);

  // Individual detections passing the filters (live FIRMS pixels, historical archive, or the sample set).
  // Inside the chosen area's real border (e.g. Valencia City, all of Bukidnon); if it has none, the fires within
  // NEARBY_KM of the border instead, marked as such, so spread/heatspots still show what threatens the area.
  const { fires: filteredFires, nearby: firesNearby } = useMemo(() => {
    const query = search.toLowerCase();
    const matchesFilter = (hotspot: Hotspot) => {
      if (confidence !== "all" && hotspot.confidence !== confidence) return false;
      const sensors = hotspot.sources ?? [hotspot.source];
      if (!sensors.some((s) => (s === "VIIRS" ? effectiveShowViirs : showModis))) return false;
      if (
        !hotspotMatchesStep({
          hotspot,
          step: activeStep,
          granularity,
          isHistorical: isHistoricalMode,
          isSingleDayWindow: spanDays === 1,
          quickRange,
          spanDays,
        })
      ) {
        return false;
      }
      if (
        query &&
        !`${hotspot.name} ${hotspot.settlement} ${hotspot.municipality}`
          .toLowerCase()
          .includes(query)
      )
        return false;
      return true;
    };

    // Never pass sample fires off as real ones: while live (loading or failed) show none.
    const source =
      isLiveFeedActive && firmsQuery.data
        ? firmsQuery.data.data
        : live || place || isHistoricalMode
          ? NO_HOTSPOTS
          : HOTSPOTS;
    const fires = source.filter(matchesFilter);
    if (!boundary) return { fires, nearby: false };
    return splitByBorder(fires, boundary, booleanPointInPolygon, pointToPolygonDistance);
  }, [
    confidence,
    effectiveShowViirs,
    showModis,
    activeStep,
    granularity,
    isHistoricalMode,
    spanDays,
    quickRange,
    search,
    isLiveFeedActive,
    firmsQuery.data,
    place,
    live,
    boundary,
  ]);
  const areaName = boundaryName ?? place?.name ?? "this area";

  const harmonizedClusters: ClusteredHotspot[] = useMemo(
    () => clusterHotspots(filteredFires),
    [filteredFires],
  );
  const unharmonizedList: ClusteredHotspot[] = useMemo(
    () => unharmonizedHotspots(filteredFires),
    [filteredFires],
  );
  const harmonizationStats = useMemo(
    () => computeHarmonizationStats(filteredFires, harmonizedClusters),
    [filteredFires, harmonizedClusters],
  );
  const visibleHotspots: ClusteredHotspot[] = useMemo(
    () => (harmonized ? harmonizedClusters : unharmonizedList),
    [harmonized, harmonizedClusters, unharmonizedList],
  );
  // Heatspots: every detection (not the clusters), weighted by its fire radiative power when known.
  const heatPoints = useMemo(
    () => filteredFires.map((h) => ({ lat: h.lat, lng: h.lng, weight: h.frp ?? h.count })),
    [filteredFires],
  );

  // Wind overlays (Wildfires view): animated live wind, wind-driven spread estimate, heatspot glow.
  // Part of LIVE mode: wind and heatspots start on (LIVE is the default) and come back on when LIVE is picked.
  const [windOn, setWindOn] = useState(true);
  const [spreadOn, setSpreadOn] = useState(false);
  const [heatOn, setHeatOn] = useState(true);
  const [viewBbox, setViewBbox] = useState<[number, number, number, number]>([7.3, 124.5, 8.6, 125.5]);
  // One global wind field (NOAA GFS) covers the whole map at every zoom; refreshed every 30 min.
  const windQuery = useQuery({
    queryKey: ["wind-field"],
    queryFn: fetchWindField,
    enabled: !climate && windOn,
    staleTime: 30 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    // NOAA is often slow: keep retrying (the last good wind stays on the map meanwhile).
    retry: 4,
    retryDelay: (n) => Math.min(30_000, 3_000 * 2 ** n),
  });
  // shortcut: spread is estimated for the 40 strongest fires only, to keep the request small.
  const spreadFires = useMemo(() => visibleHotspots.slice(0, 40).map((h) => ({ lat: h.lat, lng: h.lng })), [visibleHotspots]);
  const fireWindQuery = useQuery({
    queryKey: ["fire-wind", spreadFires.map((f) => `${f.lat.toFixed(3)},${f.lng.toFixed(3)}`).join(";")],
    placeholderData: keepPreviousData,
    queryFn: () => fetchFireWinds(spreadFires),
    enabled: !climate && spreadOn && spreadFires.length > 0,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  });
  const spread = useMemo(() => (fireWindQuery.data ? spreadFeatures(fireWindQuery.data) : null), [fireWindQuery.data]);
  // Wind right now at the place (or the map centre), for the sidebar readout.
  const windHere = useMemo(() => {
    if (!windQuery.data) return null;
    const lat = place?.lat ?? (viewBbox[0] + viewBbox[2]) / 2;
    const lng = place?.lng ?? (viewBbox[1] + viewBbox[3]) / 2;
    const v = sampleWind(windQuery.data, lat, lng);
    const toward = ((Math.atan2(v.u, v.v) * 180) / Math.PI + 360) % 360;
    return { speed: Math.hypot(v.u, v.v), from: compassOf(toward + 180), toward: compassOf(toward) };
  }, [windQuery.data, place, viewBbox]);

  // Memoized: a new array every render would re-run the map's marker/pan effect and cut off fly-to animations.
  const mapIncidents = useMemo(
    () =>
      climate
        ? []
        : visibleHotspots.map((h) => ({
            name: h.name,
            count: h.count,
            severity: SEVERITY_OF[h.confidence],
            lat: h.lat,
            lng: h.lng,
            sources: h.sources,
            footprint: h.geoJsonPolygon,
          })),
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
  const selectedIndex = selectedHotspot ? visibleHotspots.indexOf(selectedHotspot) : 0;

  // Spread on (or another fire picked): fly to that fire, close enough that its +1 h / +3 h / +6 h zones are
  // clearly visible. They are drawn true to scale, so at region zoom a light wind's zones hide under the marker.
  const fittedSpread = useRef<string | null>(null);
  useEffect(() => {
    if (!spreadOn || climate) {
      fittedSpread.current = null;
      return;
    }
    const fw = fireWindQuery.data?.find((f) => f.lat === selectedHotspot?.lat && f.lng === selectedHotspot?.lng) ?? fireWindQuery.data?.[0];
    if (!fw) return;
    const key = `${fw.lat},${fw.lng}`;
    if (fittedSpread.current === key) return;
    const e = spreadEllipse(fw.lat, fw.lng, fw.hourly, 6);
    if (!e) return;
    fittedSpread.current = key;
    const ring = [...e.polygon.coordinates[0]!, [fw.lng, fw.lat]];
    const xs = ring.map((c) => c[0]!), ys = ring.map((c) => c[1]!);
    mapRef.current?.fitBounds(
      [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]],
      { padding: 110, maxZoom: 15, duration: 1800 },
    );
  }, [spreadOn, climate, fireWindQuery.data, selectedHotspot?.lat, selectedHotspot?.lng]);
  const activeCount = harmonized
    ? harmonizationStats.harmonizedClusterCount
    : harmonizationStats.rawDetectionCount;
  const highCount = harmonized
    ? harmonizedClusters.filter((h) => h.confidence === "high" || h.isMultiSensor).length
    : unharmonizedList.filter((h) => h.confidence === "high").length;
  const closest = visibleHotspots.reduce(
    (min, h) => Math.min(min, h.proximityKm),
    visibleHotspots[0]?.proximityKm ?? 0,
  );

  const liveStatus: EmberLiveStatus = useMemo(() => {
    if (!live && !isHistoricalMode) return { mode: "sample", state: "idle" };
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
  }, [live, isHistoricalMode, firmsQuery.isFetching, firmsQuery.isError, firmsQuery.error, firmsQuery.data]);

  return (
    <EmberShell active="overview" title="Overview" liveStatus={liveStatus}>
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
        <div className="ember-page-actions">
          <Button variant="outline" className="ember-export-button" asChild>
            <Link href="/detections">
              <Radio size={15} /> Export briefing
            </Link>
          </Button>
        </div>
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
              <ArrowUpRight size={13} />{" "}
              {harmonized ? `-${harmonizationStats.reductionPercent}%` : `${harmonizationStats.rawPixelCount} px`}
            </span>
            <span>
              {harmonized
                ? `fused from ${harmonizationStats.rawDetectionCount} raw detections`
                : `unharmonized (${harmonizationStats.harmonizedClusterCount} when harmonized)`}
            </span>
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
            <span>
              {harmonizationStats.dualSensorConfirmedCount} dual-sensor confirmed
            </span>
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
            <p>{regionLabel}</p>
          </div>
          <div className="ember-map-heading-actions">
            <div className="ember-map-control-group">
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
            </div>
            <div className="ember-map-control-group">
            <Button
              variant="outline"
              size="sm"
              className="ember-layer-button"
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
                onClick={() => {
                  setLive(true);
                  setWindOn(true);
                  setHeatOn(true);
                }}
              >
                {firmsQuery.isFetching ? "LOADING" : "LIVE"}
              </button>
            </div>
            <div className="ember-window-selector" aria-label="Sensor layers">
              <button
                type="button"
                disabled={isModisEraOnly}
                aria-pressed={effectiveShowViirs}
                className={effectiveShowViirs ? "selected" : ""}
                title={isModisEraOnly ? "VIIRS launched in 2012" : "Toggle VIIRS 375m layer"}
                style={isModisEraOnly ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                onClick={() => {
                  if (!isModisEraOnly) setShowViirs(!showViirs);
                }}
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
        </div>
        {view === "fires" && (
          <div
            className="ember-harmonize-bar"
            role="region"
            aria-label="Harmonized vs Unharmonized comparison"
          >
            <div className="ember-harmonize-bar-info">
              <div className="ember-harmonize-bar-title">
                <span>MODIS + VIIRS HARMONIZATION</span>
                <span className="ember-harmonize-delta">
                  {harmonizationStats.mergedDuplicateCount > 0
                    ? `-${harmonizationStats.reductionPercent}% duplicates merged`
                    : "Sensor-fused"}
                </span>
              </div>
              <p>
                Compare cross-sensor fused fire events against raw unmerged MODIS (1 km) &amp; VIIRS (375 m) detections.
              </p>
            </div>
            <div className="ember-harmonize-bar-actions" role="radiogroup" aria-label="Harmonization mode">
              <button
                type="button"
                role="radio"
                aria-checked={harmonized}
                className={`ember-harmonize-card ${harmonized ? "active" : ""}`}
                title="Harmonized: deduplicates overlapping MODIS (1km) + VIIRS (375m) passes into unified fire events"
                onClick={() => setHarmonized(true)}
              >
                <small>HARMONIZED (FUSED)</small>
                <div className="ember-harmonize-card-metric">
                  <strong>{harmonizationStats.harmonizedClusterCount}</strong>
                  <span>{harmonizationStats.dualSensorConfirmedCount} dual-sensor · ≥96% conf</span>
                </div>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!harmonized}
                className={`ember-harmonize-card ${!harmonized ? "active" : ""}`}
                title="Unharmonized: shows raw individual MODIS and VIIRS satellite pixel detections before fusion"
                onClick={() => setHarmonized(false)}
              >
                <small>UNHARMONIZED (RAW)</small>
                <div className="ember-harmonize-card-metric">
                  <strong>{harmonizationStats.rawDetectionCount}</strong>
                  <span>
                    {harmonizationStats.viirsRawCount} VIIRS · {harmonizationStats.modisRawCount} MODIS
                  </span>
                </div>
              </button>
            </div>
          </div>
        )}
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
              showViirs={effectiveShowViirs}
              showModis={showModis}
              activeDate={activeScrubDate}
              isHistoricalDate={isHistoricalMode}
              onBoundsChange={(b) => setBbox((prev) => (keepBox(prev, b) ? prev : b))} // zooming in keeps the loaded fires
              onViewChange={setViewBbox}
              projection={mapView}
              focus={focusPlace ? { lat: focusPlace.lat, lng: focusPlace.lng, label: pinLabel } : null}
              areas={climate ? (contours?.areas ?? null) : null}
              outline={boundary}
              fitTo={boundaryBbox}
              wind={!climate && windOn ? (windQuery.data ?? null) : null}
              spread={!climate && spreadOn ? spread : null}
              spreadWinds={!climate && spreadOn ? (fireWindQuery.data ?? null) : null}
              spreadPreviewHour={
                !climate && spreadOn && granularity === "subdaily" ? activeStep.spreadHours : null
              }
              heatPoints={!climate && heatOn ? heatPoints : null}
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
                document.querySelector(".ember-map-section .ember-map-layout")?.classList.toggle("map-expanded")
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
              {view === "fires" && (
                <div style={{ marginTop: "12px" }}>
                  <div className="ember-sort-label" style={{ padding: 0, marginBottom: "8px" }}>
                    <span>WIND &amp; FIRE SPREAD</span>
                  </div>
                  <div className="ember-window-selector" aria-label="Wind and fire overlays" style={{ width: "100%", display: "flex" }}>
                    {(
                      [
                        ["Wind", windOn, setWindOn, windQuery.isFetching, "Animated live wind, coloured by speed"],
                        ["Spread", spreadOn, setSpreadOn, fireWindQuery.isFetching, "Where the wind pushes each fire in 1, 3 and 6 h"],
                        ["Heatspots", heatOn, setHeatOn, false, "Heat glow of the detections"],
                      ] as const
                    ).map(([label, on, set, busy, title]) => (
                      <button
                        type="button"
                        key={label}
                        aria-pressed={on}
                        className={on ? "selected" : ""}
                        title={`${title} (click to turn ${on ? "off" : "on"})`}
                        onClick={() => set(!on)}
                        style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "5px" }}
                      >
                        {/* Explicit state: these start ON in live mode, so a plain highlight was easy to misread. */}
                        <i
                          aria-hidden
                          style={{
                            width: "7px",
                            height: "7px",
                            borderRadius: "50%",
                            background: on ? "#4cc36a" : "transparent",
                            border: `1.5px solid ${on ? "#4cc36a" : "currentColor"}`,
                            opacity: on ? 1 : 0.6,
                          }}
                        />
                        {label}
                        <small style={{ fontSize: "9px", opacity: 0.8 }}>{on ? (busy ? "…" : "ON") : "OFF"}</small>
                      </button>
                    ))}
                  </div>
                  {windOn && (
                    <div style={{ marginTop: "10px", fontSize: "12px" }}>
                      {windQuery.isError ? (
                        <span style={{ opacity: 0.75 }}>Live wind is unavailable right now (weather service limit or offline). Try again in a minute.</span>
                      ) : windHere ? (
                        <b>
                          Wind {Math.round(windHere.speed)} km/h from the {windHere.from}, pushing fire {windHere.toward}
                          {place ? ` · at ${place.name}` : " · map centre"}
                        </b>
                      ) : (
                        <span style={{ opacity: 0.75 }}>Loading live wind…</span>
                      )}
                      <div
                        style={{
                          marginTop: "6px",
                          height: "8px",
                          borderRadius: "2px",
                          background: `linear-gradient(to right, ${WIND_SCALE.map(([, c]) => c).join(", ")})`,
                        }}
                      />
                      <div style={{ display: "flex", fontSize: "10px", opacity: 0.75 }}>
                        {WIND_SCALE.map(([min]) => (
                          <span key={min} style={{ flex: 1 }}>{min}</span>
                        ))}
                      </div>
                      <small style={{ fontSize: "10px", opacity: 0.75 }}>km/h · 10 m above ground · {windQuery.data?.run ?? "NOAA GFS"}</small>
                    </div>
                  )}
                  {spreadOn && (
                    <div style={{ marginTop: "10px", fontSize: "12px" }}>
                      <div style={{ display: "flex", gap: "12px" }}>
                        {([["+1 h", "#e3211c"], ["+3 h", "#ff8c1a"], ["+6 h", "#ffd000"]] as const).map(([t, c]) => (
                          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                            <i style={{ width: "10px", height: "10px", borderRadius: "2px", background: c, opacity: 0.8 }} /> {t}
                          </span>
                        ))}
                      </div>
                      <small style={{ display: "block", fontSize: "10px", opacity: 0.75, marginTop: "4px" }}>
                        {fireWindQuery.isError
                          ? "Wind forecast unavailable right now."
                          : spreadFires.length === 0
                            ? place && boundary
                              ? `No fires inside ${areaName} or within ${NEARBY_KM} km of it in this time window. Try the 7-day timeline or another area.`
                              : "No fires to project in this view."
                            : `Projected for the ${spreadFires.length} strongest fires from the hourly wind forecast (head fire ≈ 10% of wind speed). Ignores fuel and slope; hover an area for details.`}
                      </small>
                    </div>
                  )}
                  {firesNearby && (spreadOn || heatOn) && (
                    <div
                      role="status"
                      style={{ marginTop: "10px", padding: "7px 9px", borderRadius: "4px", fontSize: "11px", background: "rgb(255 140 26 / 14%)", border: "1px solid rgb(255 140 26 / 40%)" }}
                    >
                      No fires inside {areaName} right now. Showing <b>{filteredFires.length}</b> detection{filteredFires.length === 1 ? "" : "s"} within {NEARBY_KM} km of its border that the wind could push in.
                    </div>
                  )}
                </div>
              )}
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
                areasLoading={levelsQuery.isLoading || boundaryQuery.isLoading || gridQuery.isLoading}
                areasFailed={gridQuery.isError}
                levels={levels}
                levelKey={level?.key ?? null}
                onLevelChange={chooseLevel}
                levelMissing={borderMissing ? missingName : null}
                coverageOf={boundary ? (boundaryName ?? focusPlace.name) : null}
              />
            ) : (
              <>
            <div className="ember-panel-header">
              <div>
                <div className="ember-panel-title">
                  {harmonized ? "Priority clusters" : "Raw detections"}{" "}
                  <span>{visibleHotspots.length.toString().padStart(2, "0")}</span>
                </div>
                <p>
                  {harmonized
                    ? "Fused MODIS (1km) + VIIRS (375m) fire events"
                    : "Unharmonized individual satellite pixels"}
                </p>
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
                      <span className="ember-incident-area">{place ? hotspot.settlement : hotspot.municipality === "Regional" ? hotspot.settlement : `${hotspot.municipality}, Bukidnon`}</span>
                      <span className="ember-incident-meta">
                        {hotspot.acqTime}
                        <span>·</span>
                        {(hotspot.sources ?? [hotspot.source]).join(" + ")}
                        <span>·</span>
                        {hotspot.count} {harmonized ? "detections" : "px"}
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
        <HistoricalFireNavigator
          todayStr={todayStr}
          quickRange={quickRange}
          granularity={granularity}
          historicalDate={historicalDate}
          spanDays={spanDays}
          steps={timelineModel.steps}
          scrubIndex={clampedScrubIndex}
          startLabel={timelineModel.startLabel}
          endLabel={timelineModel.endLabel}
          isHistorical={isHistoricalMode}
          isModisEraOnly={isModisEraOnly}
          playing={playing}
          spreadOn={spreadOn}
          loadingArchive={isHistoricalMode && firmsQuery.isFetching}
          onSelectQuickRange={handleSelectQuickRange}
          onChangeGranularity={handleChangeGranularity}
          onSelectHistoricalDate={handleSelectHistoricalDate}
          onChangeSpanDays={handleChangeSpanDays}
          onBackToLive={handleBackToLive}
          onScrubChange={(idx) => {
            setPlaying(false);
            setScrubIndex(idx);
          }}
          onTogglePlay={() => {
            if (!playing && clampedScrubIndex >= timelineModel.steps.length - 1) {
              setScrubIndex(0);
            }
            setPlaying(!playing);
          }}
        />
        <SmartActionGuide place={place ?? DEFAULT_PLACE} onLocate={handleLocate} />

      </section>

      <section className="ember-bottom-strip">
        <div>
          <span className="ember-bottom-icon">
            <Flame size={16} />
          </span>
          <span>
            <b>
              {isHistoricalMode
                ? `Historical archive · ${formatShortDate(activeScrubDate)}`
                : live
                  ? "Live NASA FIRMS detections"
                  : "Bukidnon detections"}
            </b>
            <small>
              {live || isHistoricalMode
                ? firmsQuery.isError
                  ? "Live feed failed. No detections shown; try again shortly"
                  : `${activeCount} ${isHistoricalMode ? "archive" : "live"} detections · ${place ? (boundary ? (firesNearby ? `within ${NEARBY_KM} km of ${areaName} (none inside)` : `inside ${areaName}`) : `~55 km around ${place.name}`) : firmsQuery.data?.region === "Global" ? "Global" : "SouthEast_Asia"}`
                : `${visibleHotspots.length} clusters · closest settlement ${closest.toFixed(1)} km`}
            </small>
          </span>
        </div>
        <div className="ember-bottom-right">
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
