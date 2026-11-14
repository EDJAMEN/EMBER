"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Backpack, CircleCheck, ClipboardList, LocateFixed, MapPin, Search, Thermometer, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fetchFirmsHotspots } from "@/lib/firms-client";
import { haversineKm } from "@/lib/hotspots";
import { buildGuide, NEARBY_KM, type HeatLevel } from "@/lib/action-guide";
import { firmsKey, type GuidePlace } from "@/lib/geocode";
import { PlaceCombobox } from "@/components/place-combobox";
import { conditionsKey, fetchConditions } from "@/lib/conditions";

// Icon + text per level so the level never depends on color alone (README §5).
export const HEAT_BADGE: Record<HeatLevel, { icon: string; color: string }> = {
  None: { icon: "○", color: "var(--muted-foreground)" },
  Caution: { icon: "▲", color: "#d99a2b" },
  "Extreme Caution": { icon: "▲▲", color: "#e86a1f" },
  Danger: { icon: "◆", color: "#e2481f" },
  "Extreme Danger": { icon: "✖", color: "#b4161b" },
};

export function SmartActionGuide({ place, onLocate }: { place: GuidePlace; onLocate: (place: GuidePlace) => void }) {
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const choose = (next: GuidePlace) => {
    setQuery("");
    setMessage("");
    onLocate(next);
  };

  const locateMe = () => {
    if (!navigator.geolocation) return setMessage("Your browser does not support location.");
    setMessage("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        choose({
          name: "My location",
          region: `${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => setMessage("Location permission was denied. Search for your place instead."),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  };

  const conditions = useQuery({
    queryKey: conditionsKey(place.lat, place.lng),
    queryFn: () => fetchConditions(place.lat, place.lng),
    staleTime: 10 * 60 * 1000,
  });
  const hotspots = useQuery({
    queryKey: firmsKey(place),
    queryFn: () => fetchFirmsHotspots(place),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const c = conditions.data;
  const guide = buildGuide({
    hotspots: hotspots.isError
      ? null
      : (hotspots.data ?? []).map((h) => ({
          distanceKm: haversineKm(place.lat, place.lng, h.lat, h.lng),
          highConfidence: h.confidence === "high",
        })),
    tempC: c?.tempC ?? null,
    humidity: c?.humidity ?? null,
    windKmh: c?.windKmh ?? null,
    usAqi: c?.usAqi ?? null,
  });
  const loading = conditions.isLoading || hotspots.isLoading;
  const badge = HEAT_BADGE[guide.heat];

  return (
    <div className="ember-panel" style={{ marginTop: "16px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div className="ember-detail-kicker">
            <ClipboardList size={13} /> SMART ACTION GUIDE
          </div>
          <h3 style={{ fontSize: "16px", fontWeight: 700, marginTop: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
            <MapPin size={15} /> {place.name}
            <span style={{ fontWeight: 400, color: "var(--muted-foreground)", fontSize: "12px" }}>{place.region}</span>
          </h3>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
          <PlaceCombobox
            className="ember-map-search"
            style={{ position: "relative", top: 0, right: 0 }}
            label="Search any place worldwide"
            placeholder="Search any city or town"
            value={query}
            onChange={setQuery}
            onPick={choose}
            before={<Search size={15} />}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ember-layer-button"
            onClick={locateMe}
          >
            <LocateFixed size={14} /> Use my location
          </Button>
        </div>
      </div>

      {message && (
        <div role="status" style={{ marginTop: "10px", fontSize: "12px" }}>
          <span style={{ color: "var(--muted-foreground)" }}>{message}</span>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "14px", fontSize: "12px" }} aria-live="polite">
        <span>
          <Thermometer size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> Temperature{" "}
          <b>{c?.tempC != null ? `${Math.round(c.tempC)}°C` : loading ? "…" : "—"}</b>
        </span>
        <span>
          Humidity <b>{c?.humidity != null ? `${Math.round(c.humidity)}%` : loading ? "…" : "—"}</b>
        </span>
        <span>
          Heat index <b>{guide.heatIndex !== null ? `${Math.round(guide.heatIndex)}°C` : loading ? "…" : "—"}</b>{" "}
          <span style={{ color: badge.color, fontWeight: 700 }}>
            {badge.icon} {guide.heat === "None" ? "No heat warning" : guide.heat}
          </span>
        </span>
        <span>
          Air quality <b>{c?.usAqi != null ? `AQI ${Math.round(c.usAqi)}` : loading ? "…" : "—"}</b>
        </span>
        <span>
          Hotspots ≤ {NEARBY_KM} km <b>{hotspots.isLoading ? "…" : hotspots.isError ? "n/a" : guide.nearbyCount}</b>
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginTop: "16px" }}>
        <GuideList icon={<TriangleAlert size={14} />} title="Environmental update" items={guide.update} />
        <GuideList icon={<CircleCheck size={14} />} title="What to do" items={guide.todo} />
        <GuideList icon={<Backpack size={14} />} title="What to bring" items={guide.bring} />
        <GuideList icon={<ClipboardList size={14} />} title="What to prepare" items={guide.prepare} />
      </div>
      <p style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: "12px" }}>
        General guidance only. Follow your local DRRMO and health authorities. Weather and air quality: Open-Meteo. Hotspots: NASA FIRMS (last 48 h).
      </p>
    </div>
  );
}

function GuideList({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) {
  return (
    <section aria-label={title}>
      <h4 style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
        {icon} {title}
      </h4>
      <ul style={{ listStyle: "disc", paddingLeft: "18px", fontSize: "12px", lineHeight: 1.55 }}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
