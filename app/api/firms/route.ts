import { NextResponse } from "next/server";
import {
  type Confidence,
  type Hotspot,
  type SensorSource,
  normalizeModis,
  normalizeViirs,
  haversineKm,
} from "@/lib/hotspots";
import { harmonizeHotspots } from "@/lib/harmonization";

const BBOX = "124.5,7.3,125.5,8.6"; // west,south,east,north — Bukidnon (default region)
const NEAR_DEG = 0.5; // ~55 km box around a picked point; covers the action guide's 25 km radius
const DAY_RANGE = 2;

const TOWNS = [
  { settlement: "Poblacion", municipality: "Malaybalay City", lat: 8.1575, lng: 125.1278 },
  { settlement: "Poblacion", municipality: "Valencia City", lat: 7.9043, lng: 125.092 },
  { settlement: "Poblacion", municipality: "Maramag", lat: 7.7583, lng: 125.0065 },
  { settlement: "Poblacion", municipality: "Manolo Fortich", lat: 8.3677, lng: 124.8665 },
  { settlement: "Poblacion", municipality: "Quezon", lat: 7.7306, lng: 125.104 },
  { settlement: "Poblacion", municipality: "Impasugong", lat: 8.3011, lng: 125.0061 },
  { settlement: "Poblacion", municipality: "Don Carlos", lat: 7.7208, lng: 124.9989 },
];

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
  product: "VIIRS_NOAA20_NRT" | "MODIS_NRT",
  source: SensorSource,
  bbox: string,
  towns: typeof TOWNS,
): Promise<Hotspot[]> {
  const res = await fetch(
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${product}/${bbox}/${DAY_RANGE}`,
    { next: { revalidate: 600 } }
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
    let nearest = towns[0]!;
    let proximityKm = haversineKm(lat, lng, nearest.lat, nearest.lng);
    for (const town of towns.slice(1)) {
      const d = haversineKm(lat, lng, town.lat, town.lng);
      if (d < proximityKm) {
        proximityKm = d;
        nearest = town;
      }
    }
    const frp = Number.parseFloat(row["frp"] ?? "");
    out.push({
      id: (source === "VIIRS" ? 100000 : 200000) + i, // unique across sensors so fused clusters can trace members
      frp: Number.isFinite(frp) ? frp : undefined,
      name: `${nearest.municipality} live`,
      source,
      rawConfidence: `${row["confidence"]} (${source === "VIIRS" ? "categorical" : "numeric"})`,
      confidence,
      brightness: Number.isFinite(brightness) ? brightness : 300,
      acqDate: acqDate,
      acqTime: `${(row["acq_time"] ?? "").slice(0, 2)}:${(row["acq_time"] ?? "").slice(2)} UTC`,
      lat,
      lng,
      settlement: nearest.settlement ? `Near ${nearest.settlement}, ${nearest.municipality}` : `Near ${nearest.municipality}`,
      municipality: nearest.municipality,
      proximityKm: Math.round(proximityKm * 10) / 10,
      dayOffset,
      count: 1,
    });
  });
  return out;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  let bbox = BBOX;
  let towns = TOWNS;
  if (params.has("lat") || params.has("lng")) {
    const lat = Number(params.get("lat"));
    const lng = Number(params.get("lng"));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ error: "lat/lng out of range", data: [] }, { status: 400 });
    }
    const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v)).toFixed(3);
    bbox = [
      clamp(lng - NEAR_DEG, 180),
      clamp(lat - NEAR_DEG, 90),
      clamp(lng + NEAR_DEG, 180),
      clamp(lat + NEAR_DEG, 90),
    ].join(",");
    // Outside Bukidnon the reference point is the picked place itself.
    const name = (params.get("name") ?? "").slice(0, 80) || "Selected place";
    towns = [{ settlement: "", municipality: name, lat, lng }];
  }

  const key = process.env.FIRMS_MAP_KEY ?? process.env.NASA_FIRMS_MAP_KEY;
  if (!key) {
    return NextResponse.json({ error: "FIRMS_MAP_KEY is not configured", data: [] }, { status: 200 });
  }

  try {
    const [viirs, modis] = await Promise.all([
      fetchSource(key, "VIIRS_NOAA20_NRT", "VIIRS", bbox, towns), // Suomi-NPP NRT feed has had no data since 2026-11-02
      fetchSource(key, "MODIS_NRT", "MODIS", bbox, towns),
    ]);
    const raw = [...viirs, ...modis];
    // Fuse overlapping MODIS (1 km) + VIIRS (375 m) pixels into one cluster per thermal event.
    const fused = harmonizeHotspots(raw).sort((a, b) => b.brightness - a.brightness).slice(0, 200);
    return NextResponse.json({ data: fused, rawCount: raw.length });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message, data: [] }, { status: 500 });
  }
}

