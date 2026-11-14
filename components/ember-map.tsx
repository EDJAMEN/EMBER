"use client";

import { useEffect, useRef, useState } from "react";
import { sampleWind, spreadEllipse, windRgb, type FireWind, type WindField } from "@/lib/wind";
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type MapGeoJSONFeature,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";

export type EmberMapIncident = {
  name: string;
  count: number;
  severity: string;
  lat: number;
  lng: number;
  sources?: string[]; // sensors that saw a fused cluster, e.g. ["MODIS", "VIIRS"]
  footprint?: Polygon | Point; // fused cluster area from lib/harmonization
};

export type EmberMapInstance = maplibregl.Map;

export interface EmberMapLayers {
  blueMarble: boolean;
  countryBorders: boolean;
  firmsWms: boolean;
  clusteredHotspots: boolean;
}

const BLUE_MARBLE_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg";

const NATURAL_EARTH_COUNTRIES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#e2481f",
  high: "#e86a1f",
  medium: "#d99a2b",
  low: "#4d9e6b",
};

// OpenFreeMap vector styles (free, no key). Their OpenMapTiles data carries building heights for 3D.
const styleUrl = (dark: boolean) => `https://tiles.openfreemap.org/styles/${dark ? "dark" : "positron"}`;

/** Camera tilt by zoom: flat below 14, linear to 60° at 17, capped above (zoom 15.5 → 30°). */
export function pitchForZoom(zoom: number): number {
  return Math.min(60, Math.max(0, ((zoom - 14) / 3) * 60));
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

function buildingsLayer(dark: boolean): LayerSpecification {
  return {
    id: "ember-buildings-3d",
    type: "fill-extrusion",
    source: "openmaptiles",
    "source-layer": "building",
    minzoom: 14,
    paint: {
      "fill-extrusion-color": dark ? "#2c3137" : "#dcd8cf",
      // Buildings rise in as the camera tilts, instead of popping up at once.
      "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 15.5, ["coalesce", ["get", "render_height"], 6]],
      "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 14, 0, 15.5, ["coalesce", ["get", "render_min_height"], 0]],
      "fill-extrusion-opacity": 0.85,
    },
  };
}

/** Arrow pointing up (north); rotated per fire. White outline so it reads on any background. */
function arrowImage() {
  const w = 28, h = 64;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.moveTo(w / 2, 2); // tip
  g.lineTo(w - 2, 24);
  g.lineTo(w / 2 + 5, 24);
  g.lineTo(w / 2 + 5, h - 2);
  g.lineTo(w / 2 - 5, h - 2);
  g.lineTo(w / 2 - 5, 24);
  g.lineTo(2, 24);
  g.closePath();
  g.fillStyle = "#ff5a1f";
  g.strokeStyle = "#ffffff";
  g.lineWidth = 3;
  g.lineJoin = "round";
  g.stroke();
  g.fill();
  return g.getImageData(0, 0, w, h);
}

/** EMBER layers in draw order: 3D buildings (bottom) → province boundary → heat areas → fire footprints. Markers are DOM, always on top. */
function addEmberLayers(map: maplibregl.Map, dark: boolean) {
  if (map.getSource("openmaptiles")) map.addLayer(buildingsLayer(dark));
  map.addSource("ember-boundary", { type: "geojson", data: EMPTY, generateId: true });
  const hover: ExpressionSpecification = ["boolean", ["feature-state", "hover"], false];
  map.addLayer({
    id: "ember-boundary-fill",
    type: "fill",
    source: "ember-boundary",
    paint: {
      "fill-color": "#e2481f",
      "fill-opacity": ["case", hover, 0.28, ["==", ["get", "buk"], true], 0.14, 0.04],
    },
  });
  map.addLayer({
    id: "ember-boundary-line",
    type: "line",
    source: "ember-boundary",
    paint: {
      "line-color": "#e2481f",
      "line-width": ["case", hover, 3.5, ["==", ["get", "buk"], true], 2.5, 1],
      "line-opacity": ["case", ["==", ["get", "buk"], true], 1, 0.45],
    },
  });
  map.addSource("ember-areas", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "ember-areas-fill",
    type: "fill",
    source: "ember-areas",
    paint: { "fill-color": ["get", "color"], "fill-opacity": 0.55 },
  });
  map.addLayer({
    id: "ember-areas-line",
    type: "line",
    source: "ember-areas",
    paint: { "line-color": ["get", "color"], "line-width": 1, "line-opacity": 0.9 },
  });
  // Border of the selected place (e.g. Valencia City) — heat areas are clipped to it.
  map.addSource("ember-place-outline", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "ember-place-outline-casing",
    type: "line",
    source: "ember-place-outline",
    paint: { "line-color": dark ? "#000" : "#fff", "line-width": 4, "line-opacity": 0.6 },
  });
  map.addLayer({
    id: "ember-place-outline-line",
    type: "line",
    source: "ember-place-outline",
    paint: { "line-color": dark ? "#fff" : "#1f2937", "line-width": 2, "line-dasharray": [2, 1.5] },
  });
  // Heatspots: glow weighted by detections, fades into individual points up close.
  map.addSource("ember-heat", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "ember-heat-layer",
    type: "heatmap",
    source: "ember-heat",
    paint: {
      // A lone small fire still glows clearly; strong fires (high FRP, MW) glow hotter.
      "heatmap-weight": ["interpolate", ["linear"], ["get", "weight"], 0, 0.6, 10, 0.85, 50, 1],
      "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 1.5, 9, 3, 14, 5],
      "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 14, 9, 40, 14, 80],
      "heatmap-opacity": 0.85,
      "heatmap-color": [
        "interpolate", ["linear"], ["heatmap-density"],
        0, "rgba(255,230,0,0)", 0.08, "rgba(255,230,0,0.55)", 0.3, "#ffb000", 0.55, "#ff6a1a", 0.8, "#e3211c", 1, "#7f0a0a",
      ],
    },
  });
  // Wind-driven spread estimate: +6 h (faint) under +3 h under +1 h (strong), and the fire → head track.
  map.addSource("ember-spread", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "ember-spread-fill",
    type: "fill",
    source: "ember-spread",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: {
      "fill-color": ["match", ["get", "hours"], 1, "#e3211c", 3, "#ff8c1a", "#ffd000"],
      "fill-opacity": ["match", ["get", "hours"], 1, 0.55, 3, 0.32, 0.18],
    },
  });
  // Animated fire front (time-lapse 0 → 6 h): soft glow under a crisp red edge.
  map.addSource("ember-spread-live", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "ember-spread-live-fill",
    type: "fill",
    source: "ember-spread-live",
    paint: { "fill-color": "#ff3b1f", "fill-opacity": 0.22 },
  });
  map.addLayer({
    id: "ember-spread-live-glow",
    type: "line",
    source: "ember-spread-live",
    paint: { "line-color": "#ff6a1f", "line-width": 10, "line-blur": 6, "line-opacity": 0.7 },
  });
  map.addLayer({
    id: "ember-spread-live-edge",
    type: "line",
    source: "ember-spread-live",
    paint: { "line-color": "#ff2a12", "line-width": 2.5 },
  });
  // Wind-push arrow on each fire: points where the wind drives it, longer for stronger wind.
  if (!map.hasImage("ember-arrow")) map.addImage("ember-arrow", arrowImage(), { pixelRatio: 2 });
  map.addLayer({
    id: "ember-spread-arrow",
    type: "symbol",
    source: "ember-spread",
    filter: ["==", ["geometry-type"], "Point"],
    layout: {
      "icon-image": "ember-arrow",
      "icon-rotate": ["get", "toward"],
      "icon-rotation-alignment": "map",
      "icon-anchor": "bottom", // tail on the fire, head downwind
      "icon-offset": [0, -9], // start just outside the fire marker (scaled by icon-size)
      "icon-size": ["interpolate", ["linear"], ["get", "speed"], 0, 1, 10, 1.3, 30, 1.7, 60, 2.2],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  map.addLayer({
    id: "ember-spread-line",
    type: "line",
    source: "ember-spread",
    paint: {
      "line-color": ["match", ["get", "hours"], 1, "#e3211c", 3, "#ff8c1a", "#d9a400"],
      "line-width": ["case", ["==", ["geometry-type"], "LineString"], 2.5, ["==", ["get", "hours"], 1], 2.5, 1.2],
      "line-dasharray": [2, 1],
    },
  });
  map.addSource("ember-footprints", { type: "geojson", data: EMPTY });
  map.addLayer({
    id: "ember-footprints-fill",
    type: "fill",
    source: "ember-footprints",
    paint: { "fill-color": ["get", "color"], "fill-opacity": ["case", ["get", "sel"], 0.3, 0.15] },
  });
  map.addLayer({
    id: "ember-footprints-line",
    type: "line",
    source: "ember-footprints",
    paint: { "line-color": ["get", "color"], "line-width": ["case", ["get", "sel"], 2, 1], "line-opacity": 0.8 },
  });
  if (map.getSource("openmaptiles")) addLandmarkLayers(map, dark);
}

// Landmarks worth naming at street level; emergency services first since EMBER is a fire tool.
const EMERGENCY = ["hospital", "fire_station", "police"];
const LANDMARK_CLASSES = [
  ...EMERGENCY,
  "town_hall", "school", "college", "place_of_worship", "museum", "attraction", "castle", "monument",
  "stadium", "library", "theatre", "cinema", "art_gallery", "zoo", "park", "railway", "harbor",
];
const LANDMARK_MINZOOM = 15; // only once you've zoomed in far enough to see the 3D structures

/** Named landmarks (OpenMapTiles `poi`): a dot at the exact spot + its name, only at street-level zoom. */
function addLandmarkLayers(map: maplibregl.Map, dark: boolean) {
  const filter: maplibregl.FilterSpecification = [
    "all",
    ["has", "name"],
    ["in", ["get", "class"], ["literal", LANDMARK_CLASSES]],
  ];
  const color: ExpressionSpecification = [
    "case",
    ["in", ["get", "class"], ["literal", EMERGENCY]], "#e2481f",
    ["in", ["get", "class"], ["literal", ["park", "zoo"]]], "#3c9d5d",
    "#2f6fde",
  ];
  map.addLayer({
    id: "ember-landmarks-dot",
    type: "circle",
    source: "openmaptiles",
    "source-layer": "poi",
    minzoom: LANDMARK_MINZOOM,
    filter,
    paint: {
      "circle-color": color,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], LANDMARK_MINZOOM, 3.5, 18, 6],
      "circle-stroke-color": dark ? "#111" : "#fff",
      "circle-stroke-width": 1.5,
      "circle-pitch-alignment": "viewport", // stays a round dot when the camera tilts
    },
  });
  map.addLayer({
    id: "ember-landmarks-label",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "poi",
    minzoom: LANDMARK_MINZOOM,
    filter,
    layout: {
      "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], LANDMARK_MINZOOM, 10, 18, 13],
      "text-anchor": "top",
      "text-offset": [0, 0.7],
      "text-max-width": 9,
      "symbol-sort-key": ["coalesce", ["get", "rank"], 99], // most notable landmarks win label collisions
    },
    paint: {
      "text-color": dark ? "#e8e6e1" : "#2b2b2b",
      "text-halo-color": dark ? "rgba(0,0,0,0.85)" : "rgba(255,255,255,0.9)",
      "text-halo-width": 1.4,
    },
  });
}

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// `map.style` is gone once the map is removed (page change); effect cleanups can still run after that.
const setData = (map: maplibregl.Map, id: string, data: FeatureCollection) =>
  map.style && (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);

export function EmberMap({
  incidents,
  selected,
  onSelect,
  dark,
  onReady,
  focus,
  onMapClick,
  areas,
  outline = null,
  fitTo = null,
  projection = "globe",
  layers = { blueMarble: true, countryBorders: true, firmsWms: true, clusteredHotspots: true },
  showViirs = true,
  showModis = true,
  onBoundsChange,
  wind = null,
  spread = null,
  spreadWinds = null,
  spreadPreviewHour = null,
  activeDate = null,
  isHistoricalDate = false,
  heatPoints = null,
  onViewChange,
}: {
  onViewChange?: (bbox: [number, number, number, number]) => void; // after every move, any zoom: [s, w, n, e]
  wind?: WindField | null; // global live wind → animated particles over the whole map
  spread?: FeatureCollection | null; // projected fire spread areas
  spreadWinds?: FireWind[] | null; // per-fire hourly wind → animated fire front
  spreadPreviewHour?: number | null; // when scrubbing SUB-DAILY timeline, pin spread front to this hour
  activeDate?: string | null; // YYYY-MM-DD scrubbed timeline date for NASA GIBS & FIRMS WMS TIME=
  isHistoricalDate?: boolean; // true when viewing a past historical archive date
  heatPoints?: { lat: number; lng: number; weight: number }[] | null; // detections for the heat glow
  projection?: "globe" | "mercator"; // map view: 3D globe or flat map
  incidents: EmberMapIncident[];
  selected: number;
  onSelect: (index: number) => void;
  dark: boolean;
  onReady?: (map: EmberMapInstance) => void;
  focus?: { lat: number; lng: number; label: string } | null; // picked place: fly there + pin
  onMapClick?: (lat: number, lng: number) => void;
  areas?: FeatureCollection<MultiPolygon, { color: string; label: string }> | null; // temperature / heat-index contours
  outline?: Polygon | MultiPolygon | null; // border of the selected place; heat areas are clipped to it
  fitTo?: [number, number, number, number] | null; // [w, s, e, n] of the chosen area: zoom to show all of it
  layers?: EmberMapLayers;
  showViirs?: boolean;
  showModis?: boolean;
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const darkRef = useRef(dark);  const projectionRef = useRef(projection);
  const boundsChangeRef = useRef(onBoundsChange);
  boundsChangeRef.current = onBoundsChange;
  const viewChangeRef = useRef(onViewChange);
  viewChangeRef.current = onViewChange;
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const pinRef = useRef<{ marker: maplibregl.Marker; label: HTMLSpanElement } | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const prevSelectedRef = useRef(selected);
  const gibsUrlRef = useRef<string | null>(null);
  // Bumped on every style (re)load so data effects re-push into the fresh sources.
  const [styleVersion, setStyleVersion] = useState(0);
  // WMS tiles 503 without a server key, so only mount the source once the proxy confirms one.
  const [wmsReady, setWmsReady] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/firms/wms", { method: "HEAD" })
      .then((res) => {
        if (active) setWmsReady(res.ok);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Open on the whole globe, then fly down to the picked place (or the default region).
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(darkRef.current),
      center: [125.05, 7.95], // start on the monitored region so fire markers are on the visible hemisphere
      zoom: 1.2,
      attributionControl: { compact: true },
      maxPitch: 60,
    });
    mapRef.current = map;
    // Keep the canvas in step with layout changes (sidebar collapse, panel resize) instead of only window resize.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    // Zoom-driven tilt, applied inside every camera update (wheel, pinch, buttons, flyTo) so it never
    // interrupts an animation the way calling setPitch from a "zoom" listener would.
    map.transformCameraUpdate = ({ zoom }) => ({ pitch: pitchForZoom(zoom) });

    map.on("style.load", () => {
      map.setProjection({ type: projectionRef.current }); // globe: 3D sphere when zoomed out, flat up close
      if (!map.getSource("ember-boundary")) addEmberLayers(map, darkRef.current);
      setStyleVersion((v) => v + 1);
    });

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: "260px" });
    popupRef.current = popup;
    let hoveredId: string | number | undefined;
    const clearHover = () => {
      if (hoveredId !== undefined) map.setFeatureState({ source: "ember-boundary", id: hoveredId }, { hover: false });
      hoveredId = undefined;
    };
    map.on("mousemove", (e) => {
      const layers = ["ember-landmarks-dot", "ember-spread-arrow", "ember-spread-fill", "ember-areas-fill", "ember-boundary-fill"].filter((id) => map.getLayer(id));
      const top: MapGeoJSONFeature | undefined = map.queryRenderedFeatures(e.point, { layers })[0];
      clearHover();
      if (!top) return void popup.remove();
      if (top.source === "ember-boundary" && top.id !== undefined) {
        hoveredId = top.id;
        map.setFeatureState({ source: "ember-boundary", id: hoveredId }, { hover: true });
      }
      const text =
        top.layer.id === "ember-landmarks-dot"
          ? `${top.properties["name:en"] ?? top.properties.name} · ${titleCase(String(top.properties.subclass ?? top.properties.class ?? "landmark"))}`
          : String(top.properties.label ?? top.properties.name ?? "");
      popup.setLngLat(e.lngLat).setText(text).addTo(map);
    });
    map.on("mouseout", () => {
      clearHover();
      popup.remove();
    });
    map.on("click", (e) => {
      if ((e.originalEvent.target as HTMLElement | null)?.closest(".maplibregl-marker")) return; // marker clicks select incidents
      const { lat, lng } = e.lngLat.wrap(); // normalize wrapped world copies
      clickRef.current?.(lat, lng);
    });

    let boundsTimer: ReturnType<typeof setTimeout> | null = null;
    const emitBounds = () => {
      if (boundsTimer) clearTimeout(boundsTimer);
      boundsTimer = setTimeout(() => {
        const b = map.getBounds();
        viewChangeRef.current?.([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]);
        if (map.getZoom() < 3.5) return;
        boundsChangeRef.current?.([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]);
      }, 450);
    };
    map.on("moveend", emitBounds);

    readyRef.current?.(map);
    return () => {
      if (boundsTimer) clearTimeout(boundsTimer);
      resizeObserver.disconnect();
      map.off("moveend", emitBounds);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Light/dark basemap: full style reload, then style.load re-adds EMBER layers and the data effects refill them.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || darkRef.current === dark) return;
    darkRef.current = dark;
    map.setStyle(styleUrl(dark), { diff: false });
  }, [dark]);

  // Map view switch. Picking the globe zooms out so the sphere is actually visible.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || projectionRef.current === projection) return;
    projectionRef.current = projection;
    if (map.isStyleLoaded()) map.setProjection({ type: projection }); // otherwise style.load applies it
    if (projection === "globe" && map.getZoom() > 2) map.flyTo({ zoom: 1.8, duration: 2500 });
  }, [projection]);

  useEffect(() => {
    const map = mapRef.current;
    if (map && !focusRef.current) {
      map.flyTo({ center: [125.05, 7.95], zoom: 8, duration: 3000 });
    }
  }, []);

  // Fire clusters (fused MODIS + VIIRS): footprint polygons as a map layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setData(map, "ember-footprints", {
      type: "FeatureCollection",
      features: incidents.flatMap((incident, index) =>
        incident.footprint?.type === "Polygon"
          ? [
              {
                type: "Feature" as const,
                geometry: incident.footprint,
                properties: { color: SEVERITY_COLOR[incident.severity] ?? "#e2481f", sel: index === selected },
              },
            ]
          : [],
      ),
    });
  }, [incidents, selected, styleVersion]);

  // NASA GIBS Blue Marble, Natural Earth Country Borders, and FIRMS WMS Raster layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;

    const styleLayers = map.getStyle()?.layers ?? [];
    for (const lyr of styleLayers) {
      if (
        lyr.id.startsWith("ember-") ||
        lyr.id.startsWith("nasa-") ||
        lyr.id.startsWith("natural-earth-")
      ) {
        continue;
      }
      if (lyr.type === "background" || lyr.type === "fill") {
        map.setLayoutProperty(lyr.id, "visibility", layers.blueMarble ? "none" : "visible");
      }
    }

    const gibsUrl =
      isHistoricalDate && activeDate
        ? `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${activeDate}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`
        : BLUE_MARBLE_URL;
    const gibsMaxZoom = isHistoricalDate && activeDate ? 9 : 8;

    if (gibsUrlRef.current !== gibsUrl) {
      if (map.getLayer("nasa-gibs-bluemarble-layer")) map.removeLayer("nasa-gibs-bluemarble-layer");
      if (map.getSource("nasa-gibs-bluemarble")) map.removeSource("nasa-gibs-bluemarble");
      gibsUrlRef.current = gibsUrl;
    }

    if (!map.getSource("nasa-gibs-bluemarble")) {
      map.addSource("nasa-gibs-bluemarble", {
        type: "raster",
        tiles: [gibsUrl],
        tileSize: 256,
        maxzoom: gibsMaxZoom,
      });
      // Under the basemap's place/road labels (satellite + names, like a hybrid map) and therefore under the
      // 3D buildings and EMBER's data layers; fall back to those if the style has no labels.
      const firstBaseLabel = styleLayers.find((l) => l.type === "symbol" && !l.id.startsWith("ember-"))?.id;
      const beforeBoundary = [firstBaseLabel, "ember-buildings-3d", "ember-boundary-fill"].find(
        (id): id is string => !!id && !!map.getLayer(id),
      );
      map.addLayer(
        {
          id: "nasa-gibs-bluemarble-layer",
          type: "raster",
          source: "nasa-gibs-bluemarble",
          layout: { visibility: layers.blueMarble ? "visible" : "none" },
        },
        beforeBoundary,
      );
    } else if (map.getLayer("nasa-gibs-bluemarble-layer")) {
      map.setLayoutProperty(
        "nasa-gibs-bluemarble-layer",
        "visibility",
        layers.blueMarble ? "visible" : "none",
      );
    }

    if (!map.getSource("natural-earth-borders")) {
      map.addSource("natural-earth-borders", {
        type: "geojson",
        data: NATURAL_EARTH_COUNTRIES_URL,
      });
      map.addLayer({
        id: "natural-earth-borders-layer",
        type: "line",
        source: "natural-earth-borders",
        paint: {
          "line-color": "#b0b7c3",
          "line-width": 1,
          "line-opacity": 0.9,
        },
        layout: { visibility: layers.countryBorders ? "visible" : "none" },
      });
    } else if (map.getLayer("natural-earth-borders-layer")) {
      map.setLayoutProperty(
        "natural-earth-borders-layer",
        "visibility",
        layers.countryBorders ? "visible" : "none",
      );
    }

    const activeYear = activeDate ? Number(activeDate.slice(0, 4)) : 9999;
    const viirsAvailable = activeYear >= 2012;
    const activeWmsLayers: string[] = [];
    if (showViirs && viirsAvailable) activeWmsLayers.push("fires_viirs_24");
    if (showModis) activeWmsLayers.push("fires_modis_24");
    if (showViirs && viirsAvailable) activeWmsLayers.push("fires_landsat_24");

    if (map.getLayer("nasa-firms-wms-layer")) map.removeLayer("nasa-firms-wms-layer");
    if (map.getSource("nasa-firms-wms")) map.removeSource("nasa-firms-wms");

    if (wmsReady && layers.firmsWms && activeWmsLayers.length > 0) {
      const timeQuery = activeDate ? `&TIME=${encodeURIComponent(activeDate)}` : "";
      map.addSource("nasa-firms-wms", {
        type: "raster",
        tiles: [
          `/api/firms/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${activeWmsLayers.join(",")}&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&WIDTH=512&HEIGHT=512${timeQuery}&BBOX={bbox-epsg-3857}`,
        ],
        tileSize: 512, // 4× fewer requests than 256 px tiles; each one costs a FIRMS transaction
      });
      map.addLayer({
        id: "nasa-firms-wms-layer",
        type: "raster",
        source: "nasa-firms-wms",
      });
    }
  }, [styleVersion, layers.blueMarble, layers.countryBorders, layers.firmsWms, wmsReady, showViirs, showModis, activeDate, isHistoricalDate]);

  // Fire clusters: glowing count markers (DOM, unaffected by style reloads).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    if (!layers.clusteredHotspots) return;
    markersRef.current = incidents.map((incident, index) => {
      const el = document.createElement("div");
      el.className = "ember-marker";
      el.style.cursor = "pointer";
      // Only numbers and a color from a fixed map go into this HTML; names are set via setText below.
      el.innerHTML = `<div class="ember-glow${index === selected ? " ember-glow-selected" : ""}" style="--glow:${SEVERITY_COLOR[incident.severity] ?? "#e2481f"}"><span class="ember-glow-halo"></span><span class="ember-glow-core">${Number(incident.count)}</span></div>`;
      const tip = `${incident.name} · ${incident.count} detections${incident.sources?.length ? ` · ${incident.sources.join(" + ")}` : ""}`;
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        selectRef.current(index);
      });
      el.addEventListener("mouseenter", () => popupRef.current?.setLngLat([incident.lng, incident.lat]).setText(tip).addTo(map));
      el.addEventListener("mouseleave", () => popupRef.current?.remove());
      return new maplibregl.Marker({ element: el }).setLngLat([incident.lng, incident.lat]).addTo(map);
    });
    const current = incidents[selected];
    const selectionChanged = prevSelectedRef.current !== selected;
    prevSelectedRef.current = selected;
    if (current && selectionChanged) map.panTo([current.lng, current.lat]);
  }, [incidents, selected, layers.clusteredHotspots]);

  // Picked place: fly there (slow descent from the globe) and drop a labelled pin.
  const focusLat = focus?.lat;
  const focusLng = focus?.lng;
  useEffect(() => {
    const map = mapRef.current;
    pinRef.current?.marker.remove();
    pinRef.current = null;
    if (!map || focusLat === undefined || focusLng === undefined) return;
    const fromGlobe = map.getZoom() < 5;
    map.flyTo({ center: [focusLng, focusLat], zoom: Math.max(map.getZoom(), 9.5), ...(fromGlobe ? { duration: 3500 } : {}) });
    const el = document.createElement("div");
    el.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:none";
    const label = document.createElement("span");
    label.style.cssText =
      "padding:3px 7px;border-radius:4px;background:var(--popover,#fff);color:var(--popover-foreground,#111);font:600 11px var(--font-sans,sans-serif);white-space:nowrap;box-shadow:0 2px 8px rgb(0 0 0/25%)";
    label.textContent = focusRef.current?.label ?? "";
    const dot = document.createElement("span");
    dot.style.cssText = "width:16px;height:16px;border-radius:50%;background:#2f6fde;border:3px solid #fff;box-shadow:0 1px 6px rgb(0 0 0/35%)";
    el.append(label, dot);
    // Anchor at the bottom, then nudge down half the dot so the dot's center sits on the place.
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom", offset: [0, 8] }).setLngLat([focusLng, focusLat]).addTo(map);
    pinRef.current = { marker, label };
  }, [focusLat, focusLng]);

  const focusLabel = focus?.label;
  useEffect(() => {
    if (focusLabel !== undefined && pinRef.current) pinRef.current.label.textContent = focusLabel;
  }, [focusLabel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setData(map, "ember-heat", {
      type: "FeatureCollection",
      features: (heatPoints ?? []).map((h) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [h.lng, h.lat] },
        properties: { weight: h.weight },
      })),
    });
  }, [heatPoints, styleVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) setData(map, "ember-spread", spread ?? EMPTY);
  }, [spread, styleVersion]);

  // Fire-front time-lapse: synced to SUB-DAILY scrubber hour when provided, else loops 0 -> 6 h.
  const badgeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const map = mapRef.current;
    const badge = badgeRef.current;
    if (!map || !badge) return;
    const clear = () => {
      setData(map, "ember-spread-live", EMPTY);
      badge.style.display = "none";
    };
    if (!spreadWinds?.length) return clear();

    if (typeof spreadPreviewHour === "number" && Number.isFinite(spreadPreviewHour)) {
      const h = Math.max(0.05, spreadPreviewHour);
      const features = spreadWinds.flatMap((f) => {
        const e = spreadEllipse(f.lat, f.lng, f.hourly, h);
        return e ? [{ type: "Feature" as const, geometry: e.polygon, properties: {} }] : [];
      });
      setData(map, "ember-spread-live", { type: "FeatureCollection", features });
      badge.style.display = "block";
      badge.textContent = `🔥 Fire front  +${h.toFixed(1)} h`;
      return clear;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return clear();
    badge.style.display = "block";
    const CYCLE = 7_000, GROW = 6_000, HOURS = 6;
    const start = performance.now();
    let raf = 0, last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 50) return; // ~20 fps is plenty for a growing outline
      last = now;
      const h = (Math.min((now - start) % CYCLE, GROW) / GROW) * HOURS;
      const features = spreadWinds.flatMap((f) => {
        const e = spreadEllipse(f.lat, f.lng, f.hourly, Math.max(0.05, h));
        return e ? [{ type: "Feature" as const, geometry: e.polygon, properties: {} }] : [];
      });
      setData(map, "ember-spread-live", { type: "FeatureCollection", features });
      badge.textContent = `🔥 Fire front  +${h.toFixed(1)} h`;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clear();
    };
  }, [spreadWinds, spreadPreviewHour, styleVersion]);

  // Wind speed as a smooth coloured layer over the whole planet (Web Mercator image, under the place labels).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleVersion === 0) return;
    const drop = () => {
      if (!map.style) return; // map already removed (leaving the page): nothing to clean up
      if (map.getLayer("ember-wind-field")) map.removeLayer("ember-wind-field");
      if (map.getSource("ember-wind-field")) map.removeSource("ember-wind-field");
    };
    drop();
    if (!wind) return;
    const MAX_LAT = 85.0511;
    const size = 1024;
    const img = document.createElement("canvas");
    img.width = size;
    img.height = size;
    const ictx = img.getContext("2d")!;
    const data = ictx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / size))) * 180) / Math.PI; // Mercator row → latitude
      for (let x = 0; x < size; x++) {
        const v = sampleWind(wind, lat, -180 + ((x + 0.5) / size) * 360);
        const [r, g, b] = windRgb(Math.hypot(v.u, v.v));
        const k = (y * size + x) * 4;
        data.data[k] = r; data.data[k + 1] = g; data.data[k + 2] = b; data.data[k + 3] = 255;
      }
    }
    ictx.putImageData(data, 0, 0);
    const beforeLabels = map.getStyle().layers.find((l) => l.type === "symbol" && !l.id.startsWith("ember-"))?.id;
    map.addSource("ember-wind-field", {
      type: "image",
      url: img.toDataURL("image/png"),
      coordinates: [[-180, MAX_LAT], [180, MAX_LAT], [180, -MAX_LAT], [-180, -MAX_LAT]],
    });
    map.addLayer(
      { id: "ember-wind-field", type: "raster", source: "ember-wind-field", paint: { "raster-opacity": 0.72, "raster-resampling": "linear", "raster-fade-duration": 0 } },
      beforeLabels && map.getLayer(beforeLabels) ? beforeLabels : undefined,
    );
    return drop;
  }, [wind, styleVersion]);

  // Wind particles: white trails over the coloured layer; each moves with the live wind at its spot.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !wind) return;
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:absolute;top:0;left:0;pointer-events:none";
    map.getCanvas().after(canvas); // above the map, below fire markers
    const ctx = canvas.getContext("2d")!;
    let W = 0, H = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      W = map.getContainer().clientWidth;
      H = map.getContainer().clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    type Particle = { x: number; y: number; age: number };
    const spawn = (p: Particle) => {
      p.x = Math.random() * W;
      p.y = Math.random() * H;
      p.age = Math.floor(Math.random() * 60);
    };
    // Density follows the map size (it can be 0×0 while the layout settles, so this is redone on resize).
    let particles: Particle[] = [];
    const fill = () => {
      particles = Array.from({ length: Math.min(3000, Math.round((W * H) / 300)) }, () => ({ x: 0, y: 0, age: 0 }));
      particles.forEach(spawn);
    };
    fill();
    const onResize = () => { resize(); fill(); };
    const clear = () => ctx.clearRect(0, 0, W, H); // trails would smear while the map moves
    map.on("move", clear);
    map.on("resize", onResize);
    let raf = 0;
    const frame = () => {
      // Never let one bad frame (e.g. a point the globe can't project) stop the animation for good.
      try {
        draw();
      } catch {
        particles.forEach(spawn);
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    };
    const draw = () => {
      ctx.globalCompositeOperation = "destination-in"; // fade old trails
      ctx.fillStyle = "rgba(0,0,0,0.93)"; // longer, smoother trails
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineWidth = 1.2;
      const path = new Path2D();
      for (const p of particles) {
        const ll = map.unproject([p.x, p.y]);
        // Off the globe's edge unproject gives no real point: respawn instead of drawing there.
        if (!Number.isFinite(ll.lat) || Math.abs(ll.lat) > 85 || ++p.age > 90) { spawn(p); continue; }
        const v = sampleWind(wind, ll.lat, ll.lng);
        const speed = Math.hypot(v.u, v.v);
        if (speed < 0.3) continue;
        // Screen direction from projecting a tiny downwind step (handles bearing, tilt and the globe).
        const cosLat = Math.max(0.05, Math.cos((ll.lat * Math.PI) / 180));
        const q = map.project([ll.lng + (v.u / speed) * 0.001 / cosLat, ll.lat + (v.v / speed) * 0.001]);
        const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
        const px = Math.min(4, 0.08 * speed + 0.3); // on-screen speed grows with wind speed
        path.moveTo(p.x, p.y);
        p.x += (dx / len) * px;
        p.y += (dy / len) * px;
        path.lineTo(p.x, p.y);
        if (!(p.x >= 0 && p.y >= 0 && p.x <= W && p.y <= H)) spawn(p); // also catches NaN
      }
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.stroke(path);
    };
    // Reduced motion: draw still streaks (direction + strength) instead of animating, redrawn after each move.
    const still = () => { for (let k = 0; k < 40; k++) draw(); };
    if (reduced) { still(); map.on("moveend", still); } else frame();
    return () => {
      cancelAnimationFrame(raf);
      map.off("moveend", still);
      map.off("move", clear);
      map.off("resize", onResize);
      canvas.remove();
    };
  }, [wind]);

  // Temperature / heat-index contour areas.
  useEffect(() => {
    const map = mapRef.current;
    if (map) setData(map, "ember-areas", areas ?? EMPTY);
  }, [areas, styleVersion]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    setData(map, "ember-place-outline", outline ? { type: "FeatureCollection", features: [{ type: "Feature", geometry: outline, properties: {} }] } : EMPTY);
  }, [outline, styleVersion]);

  // Zoom to show the whole chosen area (a village, a province, a whole country).
  const fitKey = fitTo?.join(",");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitTo) return;
    const [w, s, e, n] = fitTo;
    // Countries spanning the dateline (bbox ≈ whole world) would zoom to nothing useful: keep the current view.
    if (e - w > 300) return;
    map.fitBounds([[w, s], [e, n]], { padding: 40, duration: 1800, maxZoom: 13 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fitKey captures fitTo's value
  }, [fitKey]);

  return (
    <>
      <div ref={containerRef} className="ember-leaflet" aria-hidden="true" />
      <div
        ref={badgeRef}
        role="status"
        style={{
          display: "none",
          position: "absolute",
          left: "50%",
          bottom: "42px",
          transform: "translateX(-50%)",
          padding: "5px 11px",
          borderRadius: "999px",
          background: "rgb(20 12 10 / 78%)",
          border: "1px solid rgb(255 90 31 / 55%)",
          color: "#ffd9cc",
          font: "600 12px var(--font-mono, monospace)",
          pointerEvents: "none",
          whiteSpace: "pre",
          boxShadow: "0 0 18px rgb(255 59 31 / 35%)",
        }}
      />
    </>
  );
}

export default EmberMap;
