import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type EmberMapIncident = {
  name: string;
  count: number;
  severity: string;
  lat: number;
  lng: number;
};

// shortcut: key inline fallback for sample build, override via VITE_CARTO_KEY.
const CARTO_KEY = import.meta.env["VITE_CARTO_KEY"] ?? "cb1_58b4_1_041443cdaab801d99e12e9f7";

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
  dark,
  onReady,
}: {
  incidents: EmberMapIncident[];
  selected: number;
  onSelect: (index: number) => void;
  dark: boolean;
  onReady?: (map: L.Map) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [7.95, 125.05],
      zoom: 9,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
    });
    mapRef.current = map;
    L.control
      .attribution({ prefix: false })
      .addAttribution(
        '© <a href="https://www.openstreetmap.org/copyright">OSM</a> © <a href="https://carto.com/">CARTO</a>',
      )
      .addTo(map);
    readyRef.current?.(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layerRef.current?.remove();
    layerRef.current = L.tileLayer(
      dark
        ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
        : `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
      { maxZoom: 19 },
    ).addTo(map);
  }, [dark]);

  // Provincial boundaries: GADM open dataset, Bukidnon emphasized, neighbors subtle.
  // shortcut: remote fetch, boundaries absent offline but map/markers still work.
  useEffect(() => {
    let cancelled = false;
    fetch("https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_PHL_2.json")
      .then((res) => {
        if (!res.ok) throw new Error("boundary fetch failed");
        return res.json();
      })
      .then((collection) => {
        const map = mapRef.current;
        if (cancelled || !map) return;
        const props = (f?: { properties?: unknown }) =>
          (f?.properties ?? {}) as Record<string, unknown>;
        const nameOf = (f?: { properties?: unknown }) =>
          ["NAME_2", "NAME_1", "name", "province", "PROVINCE"]
            .map((key) => props(f)[key])
            .find((v): v is string => typeof v === "string") ?? "Province";
        const isBukidnon = (f?: { properties?: unknown }) =>
          Object.values(props(f)).some(
            (v) => typeof v === "string" && v.toLowerCase() === "bukidnon",
          );
        const layer = L.geoJSON(collection, {
          style: (f) =>
            isBukidnon(f as { properties?: unknown })
              ? { color: "#e2481f", weight: 2.5, fillColor: "#e2481f", fillOpacity: 0.14 }
              : {
                  color: "#e2481f",
                  weight: 1,
                  opacity: 0.45,
                  fillColor: "#e2481f",
                  fillOpacity: 0.04,
                },
          onEachFeature: (f, l) => {
            l.bindTooltip(nameOf(f), { sticky: true });
            l.on("mouseover", (e) => {
              const target = e.target as L.Path;
              target.setStyle({ weight: 3.5, fillOpacity: 0.28 });
              target.bringToFront();
            });
            l.on("mouseout", (e) => {
              layer.resetStyle(e.target as L.Path);
            });
          },
        }).addTo(map);
        const buk = layer
          .getLayers()
          .find((l) => isBukidnon((l as L.GeoJSON).feature as unknown as { properties?: unknown }));
        const bounds = (buk as L.GeoJSON | undefined)?.getBounds?.() ?? layer.getBounds();
        map.fitBounds(bounds, { padding: [24, 24] });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
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
    const current = incidents[selected];
    if (current) map.panTo([current.lat, current.lng], { animate: true });
  }, [incidents, selected]);

  return <div ref={containerRef} className="ember-leaflet" aria-hidden="true" />;
}
