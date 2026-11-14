"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type MapGeoJSONFeature,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon, Position } from "geojson";

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
}

const setData = (map: maplibregl.Map, id: string, data: FeatureCollection) =>
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);

/** [west, south, east, north] of every coordinate in the given features. */
function bboxOf(features: Feature[]): [number, number, number, number] | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") {
      const [x, y] = c as Position;
      w = Math.min(w, x!); e = Math.max(e, x!); s = Math.min(s, y!); n = Math.max(n, y!);
    } else if (Array.isArray(c)) c.forEach(visit);
  };
  features.forEach((f) => f.geometry && "coordinates" in f.geometry && visit(f.geometry.coordinates));
  return Number.isFinite(w) ? [w, s, e, n] : null;
}

export function EmberMap({
  incidents,
  selected,
  onSelect,
  dark,
  onReady,
  focus,
  onMapClick,
  areas,
  projection = "globe",
  layers = { blueMarble: true, countryBorders: true, firmsWms: true, clusteredHotspots: true },
  showViirs = true,
  showModis = true,
  onBoundsChange,
}: {
  projection?: "globe" | "mercator"; // map view: 3D globe or flat map
  incidents: EmberMapIncident[];
  selected: number;
  onSelect: (index: number) => void;
  dark: boolean;
  onReady?: (map: EmberMapInstance) => void;
  focus?: { lat: number; lng: number; label: string } | null; // picked place: fly there + pin
  onMapClick?: (lat: number, lng: number) => void;
  areas?: FeatureCollection<MultiPolygon, { color: string; label: string }> | null; // temperature / heat-index contours
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
  const darkRef = useRef(dark);
  const projectionRef = useRef(projection);
  const boundsChangeRef = useRef(onBoundsChange);
  boundsChangeRef.current = onBoundsChange;
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const pinRef = useRef<{ marker: maplibregl.Marker; label: HTMLSpanElement } | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const prevSelectedRef = useRef(selected);
  const [boundary, setBoundary] = useState<FeatureCollection | null>(null);
  // Bumped on every style (re)load so data effects re-push into the fresh sources.
  const [styleVersion, setStyleVersion] = useState(0);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Open on the whole globe, then fly down to the picked place (or the default region).
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl(darkRef.current),
      center: [0, 15],
      zoom: 1.2,
      attributionControl: { compact: true },
      maxPitch: 60,
    });
    mapRef.current = map;

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
      const layers = ["ember-areas-fill", "ember-boundary-fill"].filter((id) => map.getLayer(id));
      const top: MapGeoJSONFeature | undefined = map.queryRenderedFeatures(e.point, { layers })[0];
      clearHover();
      if (!top) return void popup.remove();
      if (top.source === "ember-boundary" && top.id !== undefined) {
        hoveredId = top.id;
        map.setFeatureState({ source: "ember-boundary", id: hoveredId }, { hover: true });
      }
      popup.setLngLat(e.lngLat).setText(String(top.properties.label ?? top.properties.name ?? "")).addTo(map);
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
        if (map.getZoom() < 3.5) return;
        const b = map.getBounds();
        boundsChangeRef.current?.([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]);
      }, 450);
    };
    map.on("moveend", emitBounds);

    readyRef.current?.(map);
    return () => {
      if (boundsTimer) clearTimeout(boundsTimer);
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
    let cancelled = false;
    fetch("https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_PHL_2.json")
      .then((res) => {
        if (!res.ok) throw new Error("boundary fetch failed");
        return res.json() as Promise<FeatureCollection>;
      })
      .then((collection) => {
        const map = mapRef.current;
        if (cancelled || !map) return;
        const props = (f: Feature) => (f.properties ?? {}) as Record<string, unknown>;
        const nameOf = (f: Feature) =>
          ["NAME_2", "NAME_1", "name", "province", "PROVINCE"]
            .map((key) => props(f)[key])
            .find((v): v is string => typeof v === "string") ?? "Province";
        const isBukidnon = (f: Feature) =>
          Object.values(props(f)).some((v) => typeof v === "string" && v.toLowerCase() === "bukidnon");
        const features = collection.features.map((f) => ({
          ...f,
          properties: { name: nameOf(f), buk: isBukidnon(f) },
        }));
        setBoundary({ type: "FeatureCollection", features });
        const box = bboxOf(features.filter((f) => f.properties.buk)) ?? bboxOf(features);
        // Descend from the globe to the region, unless a restored/picked place already took over.
        if (box && !focusRef.current) map.fitBounds(box, { padding: 24, duration: 3000 });
      })
      .catch(() => {
        const map = mapRef.current;
        if (!cancelled && map && !focusRef.current) map.flyTo({ center: [125.05, 7.95], zoom: 8, duration: 3000 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map && boundary) setData(map, "ember-boundary", boundary);
  }, [boundary, styleVersion]);

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

    if (!map.getSource("nasa-gibs-bluemarble")) {
      map.addSource("nasa-gibs-bluemarble", {
        type: "raster",
        tiles: [BLUE_MARBLE_URL],
        tileSize: 256,
        maxzoom: 8,
      });
      const beforeBoundary = map.getLayer("ember-boundary-fill") ? "ember-boundary-fill" : undefined;
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

    const activeWmsLayers: string[] = [];
    if (showViirs) activeWmsLayers.push("fires_viirs_24");
    if (showModis) activeWmsLayers.push("fires_modis_24");
    if (showViirs) activeWmsLayers.push("fires_landsat_24");

    if (map.getLayer("nasa-firms-wms-layer")) map.removeLayer("nasa-firms-wms-layer");
    if (map.getSource("nasa-firms-wms")) map.removeSource("nasa-firms-wms");

    if (layers.firmsWms && activeWmsLayers.length > 0) {
      map.addSource("nasa-firms-wms", {
        type: "raster",
        tiles: [
          `/api/firms/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=${activeWmsLayers.join(",")}&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&WIDTH=256&HEIGHT=256&BBOX={bbox-epsg-3857}`,
        ],
        tileSize: 256,
      });
      map.addLayer({
        id: "nasa-firms-wms-layer",
        type: "raster",
        source: "nasa-firms-wms",
      });
    }
  }, [styleVersion, layers.blueMarble, layers.countryBorders, layers.firmsWms, showViirs, showModis]);

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

  // Temperature / heat-index contour areas.
  useEffect(() => {
    const map = mapRef.current;
    if (map) setData(map, "ember-areas", areas ?? EMPTY);
  }, [areas, styleVersion]);

  return <div ref={containerRef} className="ember-leaflet" aria-hidden="true" />;
}

export default EmberMap;
