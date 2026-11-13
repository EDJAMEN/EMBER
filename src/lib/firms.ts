// Server-side FIRMS proxy. MAP_KEY never leaves the server.
import { createServerFn } from "@tanstack/react-start";
import type { Confidence, Hotspot, SensorSource } from "./hotspots";
import { normalizeModis, normalizeViirs } from "./hotspots";

const BBOX = "124.5,7.3,125.5,8.6"; // west,south,east,north — Bukidnon
const DAY_RANGE = 2;

// Reference towns for sample-style proximity labels on live points.
const TOWNS = [
  { settlement: "Poblacion", municipality: "Malaybalay City", lat: 8.1575, lng: 125.1278 },
  { settlement: "Poblacion", municipality: "Valencia City", lat: 7.9043, lng: 125.092 },
  { settlement: "Poblacion", municipality: "Maramag", lat: 7.7583, lng: 125.0065 },
  { settlement: "Poblacion", municipality: "Manolo Fortich", lat: 8.3677, lng: 124.8665 },
  { settlement: "Poblacion", municipality: "Quezon", lat: 7.7306, lng: 125.104 },
  { settlement: "Poblacion", municipality: "Impasugong", lat: 8.3011, lng: 125.0061 },
  { settlement: "Poblacion", municipality: "Don Carlos", lat: 7.7208, lng: 124.9989 },
];

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const header = (lines[0] ?? "").split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

async function fetchSource(
  key: string,
  product: "VIIRS_SNPP_NRT" | "MODIS_NRT",
  source: SensorSource,
): Promise<Hotspot[]> {
  const res = await fetch(
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${product}/${BBOX}/${DAY_RANGE}`,
  );
  if (!res.ok) throw new Error(`FIRMS ${product} responded ${res.status}`);
  const rows = parseCsv(await res.text());
  const seen = new Set<string>();
  const out: Hotspot[] = [];
  rows.forEach((row, i) => {
    const lat = Number(row["latitude"]);
    const lng = Number(row["longitude"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const acqDate = row["acq_date"] ?? "";
    const dayOffset = acqDate === new Date().toISOString().slice(0, 10) ? 0 : -1;
    const dedupeKey = `${source}|${lat.toFixed(3)}|${lng.toFixed(3)}|${acqDate}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    const raw = (row["confidence"] ?? "").toLowerCase();
    const confidence: Confidence =
      source === "VIIRS"
        ? normalizeViirs(raw.startsWith("h") ? "h" : raw.startsWith("n") ? "n" : "l")
        : normalizeModis(Number.parseFloat(raw));
    const brightness = Number.parseFloat(
      row["bright_ti4"] ?? row["bright_ti5"] ?? row["brightness"] ?? "",
    );
    let nearest = TOWNS[0]!;
    let proximityKm = haversineKm(lat, lng, nearest.lat, nearest.lng);
    for (const town of TOWNS.slice(1)) {
      const d = haversineKm(lat, lng, town.lat, town.lng);
      if (d < proximityKm) {
        proximityKm = d;
        nearest = town;
      }
    }
    out.push({
      id: 1000 + i,
      name: `${nearest.municipality} live`,
      source,
      rawConfidence: `${row["confidence"]} (${source === "VIIRS" ? "categorical" : "numeric"})`,
      confidence,
      brightness: Number.isFinite(brightness) ? brightness : 300,
      acqDate: acqDate,
      acqTime: `${(row["acq_time"] ?? "").slice(0, 2)}:${(row["acq_time"] ?? "").slice(2)} UTC`,
      lat,
      lng,
      settlement: `Near ${nearest.settlement}, ${nearest.municipality}`,
      municipality: nearest.municipality,
      proximityKm: Math.round(proximityKm * 10) / 10,
      dayOffset,
      count: 1,
    });
  });
  return out;
}

export const fetchFirmsHotspots = createServerFn({ method: "GET" }).handler(
  async (): Promise<Hotspot[]> => {
    const key = process.env["FIRMS_MAP_KEY"];
    if (!key) throw new Error("FIRMS_MAP_KEY is not set");
    const [viirs, modis] = await Promise.all([
      fetchSource(key, "VIIRS_SNPP_NRT", "VIIRS"),
      fetchSource(key, "MODIS_NRT", "MODIS"),
    ]);
    return [...viirs, ...modis].sort((a, b) => b.brightness - a.brightness).slice(0, 200);
  },
);
