"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type EmberMapIncident = {
  id?: number;
  name: string;
  count: number;
  severity: string;
  lat: number;
  lng: number;
};

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

export function EmberMap({
  incidents,
  selected,
  onSelect,
  layers,
  showViirs,
  showModis,
  panSeq,
  onBoundsChange,
  onReady,
}: {
  incidents: EmberMapIncident[];
  selected: number;
  onSelect: (index: number) => void;
  layers: EmberMapLayers;
  showViirs: boolean;
  showModis: boolean;
  panSeq?: number;
  onBoundsChange?: (bbox: [number, number, number, number]) => void;
  onReady?: (map: L.Map) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const blueMarbleRef = useRef<L.TileLayer | null>(null);
  const bordersLayerRef = useRef<L.GeoJSON | null>(null);
  const bordersDataRef = useRef<GeoJSON.GeoJsonObject | null>(null);
  const wmsLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const boundsChangeRef = useRef(onBoundsChange);
  boundsChangeRef.current = onBoundsChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [7.95, 125.05],
      zoom: 9,
      maxZoom: 18,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
    });

    // Explicit panes enforce bottom-to-top layer order regardless of toggle sequence
    const bordersPane = map.createPane("bordersPane");
    bordersPane.style.zIndex = "350";
    bordersPane.style.pointerEvents = "none";

    const wmsPane = map.createPane("wmsPane");
    wmsPane.style.zIndex = "400";
    wmsPane.style.pointerEvents = "none";

    mapRef.current = map;
    L.control
      .attribution({ prefix: false })
      .addAttribution(
        '<a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a> · <a href="https://firms.modaps.eosdis.nasa.gov/">NASA FIRMS</a> · Natural Earth',
      )
      .addTo(map);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const emitBounds = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const b = map.getBounds();
        boundsChangeRef.current?.([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()]);
      }, 450);
    };
    map.on("moveend", emitBounds);

    readyRef.current?.(map);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      map.off("moveend", emitBounds);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Layer 1: NASA GIBS Blue Marble Basemap (Bottom)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    blueMarbleRef.current?.remove();
    blueMarbleRef.current = null;
    if (!layers.blueMarble) return;

    blueMarbleRef.current = L.tileLayer(BLUE_MARBLE_URL, {
      maxNativeZoom: 8,
      maxZoom: 18,
      tileSize: 256,
    }).addTo(map);
  }, [layers.blueMarble]);

  // Layer 2: Natural Earth Country Outlines Overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!layers.countryBorders) {
      bordersLayerRef.current?.remove();
      bordersLayerRef.current = null;
      return;
    }

    let cancelled = false;
    const renderBorders = (geojson: GeoJSON.GeoJsonObject) => {
      if (cancelled || !mapRef.current) return;
      bordersLayerRef.current?.remove();
      bordersLayerRef.current = L.geoJSON(geojson, {
        pane: "bordersPane",
        interactive: false,
        style: {
          color: "#b0b7c3",
          weight: 1,
          opacity: 0.9,
          fill: false,
          fillOpacity: 0,
        },
      }).addTo(mapRef.current);
    };

    if (bordersDataRef.current) {
      renderBorders(bordersDataRef.current);
    } else {
      fetch(NATURAL_EARTH_COUNTRIES_URL)
        .then((res) => {
          if (!res.ok) throw new Error("Natural Earth fetch failed");
          return res.json() as Promise<GeoJSON.GeoJsonObject>;
        })
        .then((geojson) => {
          bordersDataRef.current = geojson;
          renderBorders(geojson);
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [layers.countryBorders]);

  // Layer 3: NASA FIRMS 24hr WMS Raster Overlay
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    wmsLayerRef.current?.remove();
    wmsLayerRef.current = null;

    if (!layers.firmsWms || (!showViirs && !showModis)) return;

    const activeWmsLayers: string[] = [];
    if (showViirs) activeWmsLayers.push("fires_viirs_24");
    if (showModis) activeWmsLayers.push("fires_modis_24");
    if (showViirs) activeWmsLayers.push("fires_landsat_24");

    wmsLayerRef.current = L.tileLayer
      .wms("/api/firms/wms", {
        layers: activeWmsLayers.join(","),
        format: "image/png",
        transparent: true,
        version: "1.1.1",
        pane: "wmsPane",
        maxZoom: 18,
      })
      .addTo(map);
  }, [layers.firmsWms, showViirs, showModis]);

  // Layer 4: Interactive Hotspot Vector Layer (Top)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (!layers.clusteredHotspots) return;

    markersRef.current = incidents.map((incident, index) =>
      L.marker([incident.lat, incident.lng], {
        icon: L.divIcon({
          className: "ember-marker",
          html: `<div class="ember-glow${index === selected ? " ember-glow-selected" : ""}" style="--glow:${SEVERITY_COLOR[incident.severity] ?? "#e2481f"}"><span class="ember-glow-halo"></span><span class="ember-glow-core">${incident.count}</span></div>`,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
      })
        .addTo(map)
        .bindTooltip(`${incident.name} · ${incident.count} detections`)
        .on("click", () => selectRef.current(index)),
    );
  }, [incidents, selected, layers.clusteredHotspots]);

  // Pan only when user explicitly selects a cluster (not on viewport pan/zoom data refresh)
  useEffect(() => {
    if (!panSeq) return;
    const map = mapRef.current;
    const current = incidents[selected];
    if (map && current) {
      map.panTo([current.lat, current.lng], { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panSeq]);

  return <div ref={containerRef} className="ember-leaflet" aria-hidden="true" />;
}

export default EmberMap;
