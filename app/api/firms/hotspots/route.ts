import { NextRequest, NextResponse } from "next/server";
import {
  type Confidence,
  type Hotspot,
  type SensorSource,
  normalizeModis,
  normalizeViirs,
} from "@/lib/hotspots";

const DEFAULT_BBOX: [number, number, number, number] = [7.3, 124.5, 8.6, 125.5];
const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

const TOWNS = [
  { settlement: "Poblacion", municipality: "Malaybalay City", lat: 8.1575, lng: 125.1278 },
  { settlement: "Poblacion", municipality: "Valencia City", lat: 7.9043, lng: 125.092 },
  { settlement: "Poblacion", municipality: "Maramag", lat: 7.7583, lng: 125.0065 },
  { settlement: "Poblacion", municipality: "Manolo Fortich", lat: 8.3677, lng: 124.8665 },
  { settlement: "Poblacion", municipality: "Quezon", lat: 7.7306, lng: 125.104 },
  { settlement: "Poblacion", municipality: "Impasugong", lat: 8.3011, lng: 125.0061 },
  { settlement: "Poblacion", municipality: "Don Carlos", lat: 7.7208, lng: 124.9989 },
];

interface WfsFeature {
  type?: string;
  id?: string | number;
  geometry?: {
    type?: string;
    coordinates?: [number, number];
  } | null;
  properties?: Record<string, unknown> | null;
}

interface WfsResponse {
  type?: string;
  features?: WfsFeature[];
}

export interface FirmsHotspotsPayload {
  data: Hotspot[];
  region: "SouthEast_Asia" | "Global";
  window: "24h" | "7d";
  fetchedAt: string;
  rawCount: number;
}

const responseCache = new Map<string, { payload: FirmsHotspotsPayload; expiresAt: number }>();

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function compass(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(rad(toLng - fromLng)) * Math.cos(rad(toLat));
  const x =
    Math.cos(rad(fromLat)) * Math.sin(rad(toLat)) -
    Math.sin(rad(fromLat)) * Math.cos(rad(toLat)) * Math.cos(rad(toLng - fromLng));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8]!;
}

type Ref = { lat: number; lng: number; name: string };

function parseBbox(raw: string | null): [number, number, number, number] {
  if (!raw) return DEFAULT_BBOX;
  const parts = raw.split(",").map((v) => Number.parseFloat(v.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return DEFAULT_BBOX;
  }
  const [minLat, minLon, maxLat, maxLon] = parts as [number, number, number, number];
  return [
    Math.max(-90, Math.min(90, minLat)),
    Math.max(-180, Math.min(180, minLon)),
    Math.max(-90, Math.min(90, maxLat)),
    Math.max(-180, Math.min(180, maxLon)),
  ];
}

function detectRegion(bbox: [number, number, number, number]): "SouthEast_Asia" | "Global" {
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const inSea = minLat >= -11 && maxLat <= 28 && minLon >= 92 && maxLon <= 141;
  return inSea ? "SouthEast_Asia" : "Global";
}

function computeDayOffset(acqDate: string): number {
  if (!acqDate) return 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
  const acqMs = Date.parse(`${acqDate}T00:00:00Z`);
  if (!Number.isFinite(todayMs) || !Number.isFinite(acqMs)) return 0;
  const diff = Math.round((acqMs - todayMs) / 86_400_000);
  return Math.max(-6, Math.min(0, diff));
}

function formatAcqTime(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "").padStart(4, "0");
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)} UTC`;
}

function normalizeConfidence(raw: unknown, source: SensorSource): { confidence: Confidence; rawLabel: string } {
  const str = String(raw ?? "").trim().toLowerCase();
  if (source === "VIIRS") {
    const flag: "l" | "n" | "h" = str.startsWith("h") ? "h" : str.startsWith("n") ? "n" : "l";
    return {
      confidence: normalizeViirs(flag),
      rawLabel: `${str || flag} (categorical)`,
    };
  }
  const num = Number.parseFloat(str);
  return {
    confidence: normalizeModis(Number.isFinite(num) ? num : 50),
    rawLabel: `${Number.isFinite(num) ? `${num}%` : str || "unknown"} (numeric)`,
  };
}

async function fetchWfsLayer(
  key: string,
  region: "SouthEast_Asia" | "Global",
  typename: string,
  source: SensorSource,
  bbox: [number, number, number, number],
  ref: Ref | null,
): Promise<Hotspot[]> {
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const bboxParam = `${minLat},${minLon},${maxLat},${maxLon},urn:ogc:def:crs:EPSG::4326`;
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAME: typename,
    SRSNAME: "urn:ogc:def:crs:EPSG::4326",
    BBOX: bboxParam,
    OUTPUTFORMAT: "application/json",
  });

  const url = `https://firms.modaps.eosdis.nasa.gov/mapserver/wfs/${region}/${encodeURIComponent(key)}/?${params.toString()}`;
  // A slow layer (NOAA-20 often is) must not hold up the others.
  const res = await fetch(url, { next: { revalidate: 120 }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) {
    throw new Error(`FIRMS WFS ${typename} responded ${res.status}`);
  }

  const json = (await res.json()) as WfsResponse;
  const features = Array.isArray(json.features) ? json.features : [];
  const out: Hotspot[] = [];

  features.forEach((feature, idx) => {
    const props = feature.properties ?? {};
    const coords = feature.geometry?.coordinates;
    const lat = Number(props["latitude"] ?? (Array.isArray(coords) ? coords[1] : NaN));
    const lng = Number(props["longitude"] ?? (Array.isArray(coords) ? coords[0] : NaN));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const acqDate = String(props["acq_date"] ?? "").slice(0, 10);
    const acqTime = formatAcqTime(props["acq_time"]);
    const { confidence, rawLabel } = normalizeConfidence(props["confidence"], source);
    const brightnessRaw = Number.parseFloat(
      String(props["bright_ti4"] ?? props["brightness"] ?? props["bright_ti5"] ?? ""),
    );
    const brightness = Number.isFinite(brightnessRaw) ? Math.round(brightnessRaw * 10) / 10 : 300;
    const frpRaw = Number.parseFloat(String(props["frp"] ?? ""));
    const frp = Number.isFinite(frpRaw) ? frpRaw : undefined;

    if (ref) {
      // Measured from the searched place itself, e.g. "12 km NE of Valencia City".
      const km = Math.round(haversineKm(ref.lat, ref.lng, lat, lng) * 10) / 10;
      const where = km < 1 ? `At ${ref.name}` : `${Math.round(km)} km ${compass(ref.lat, ref.lng, lat, lng)} of ${ref.name}`;
      out.push({
        id: 10000 + idx, name: where, source, rawConfidence: rawLabel, confidence, brightness, frp,
        acqDate, acqTime, lat, lng, settlement: where, municipality: ref.name, proximityKm: km,
        dayOffset: computeDayOffset(acqDate), count: 1,
      });
      return;
    }

    let nearest = TOWNS[0]!;
    let proximityKm = haversineKm(lat, lng, nearest.lat, nearest.lng);
    for (const town of TOWNS.slice(1)) {
      const d = haversineKm(lat, lng, town.lat, town.lng);
      if (d < proximityKm) {
        proximityKm = d;
        nearest = town;
      }
    }

    const inBukidnonRange = proximityKm <= 100;
    const municipality = inBukidnonRange ? nearest.municipality : "Regional";
    const settlement = inBukidnonRange
      ? `Near ${nearest.settlement}, ${nearest.municipality}`
      : `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E`;
    const name = inBukidnonRange
      ? `${nearest.municipality} ${source}`
      : `Sector ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;

    out.push({
      id: 10000 + idx,
      name,
      source,
      rawConfidence: rawLabel,
      confidence,
      brightness,
      frp,
      acqDate,
      acqTime,
      lat,
      lng,
      settlement,
      municipality,
      proximityKm: Math.round(proximityKm * 10) / 10,
      dayOffset: computeDayOffset(acqDate),
      count: 1,
    });
  });

  return out;
}

export async function GET(request: NextRequest) {
  const key = process.env.FIRMS_MAP_KEY?.trim() || process.env.NASA_FIRMS_MAP_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "FIRMS_MAP_KEY is not configured in .env.local", data: [] },
      { status: 503 },
    );
  }

  const { searchParams } = request.nextUrl;
  const bbox = parseBbox(searchParams.get("bbox"));
  const windowParam = searchParams.get("window") === "7d" ? "7d" : "24h";
  const regionParam = searchParams.get("region");
  const region: "SouthEast_Asia" | "Global" =
    regionParam === "Global" || regionParam === "SouthEast_Asia"
      ? regionParam
      : detectRegion(bbox);

  const refLat = Number(searchParams.get("lat"));
  const refLng = Number(searchParams.get("lng"));
  const ref: Ref | null =
    searchParams.has("lat") && Number.isFinite(refLat) && Number.isFinite(refLng) && Math.abs(refLat) <= 90 && Math.abs(refLng) <= 180
      ? { lat: refLat, lng: refLng, name: (searchParams.get("name") ?? "").slice(0, 80) || "selected place" }
      : null;

  const roundedBboxKey = bbox.map((n) => n.toFixed(2)).join(",");
  const cacheKey = `${region}|${windowParam}|${roundedBboxKey}|${ref ? `${ref.lat.toFixed(3)},${ref.lng.toFixed(3)},${ref.name}` : ""}`;
  const now = Date.now();
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
        "X-Cache": "HIT",
      },
    });
  }

  const suffix = windowParam === "7d" ? "7days" : "24hrs";
  const layers: Array<{ typename: string; source: SensorSource }> = [
    { typename: `ms:fires_noaa21_${suffix}`, source: "VIIRS" },
    { typename: `ms:fires_noaa20_${suffix}`, source: "VIIRS" },
    { typename: `ms:fires_modis_${suffix}`, source: "MODIS" },
  ];

  const results = await Promise.allSettled(
    layers.map((layer) => fetchWfsLayer(key, region, layer.typename, layer.source, bbox, ref)),
  );

  const merged: Hotspot[] = [];
  const errors: string[] = [];
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      merged.push(...result.value);
    } else {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  });

  if (merged.length === 0 && errors.length === layers.length) {
    return NextResponse.json(
      { error: errors[0] ?? "Failed to fetch FIRMS WFS feeds", data: [] },
      { status: 502 },
    );
  }

  // Deduplicate exact same sensor+coordinate+acqDate+acqTime and assign stable sequential IDs
  const seen = new Set<string>();
  const deduped: Hotspot[] = [];
  for (const item of merged) {
    const dedupeKey = `${item.source}|${item.lat.toFixed(4)}|${item.lng.toFixed(4)}|${item.acqDate}|${item.acqTime}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    deduped.push({ ...item, id: 10000 + deduped.length });
  }

  const payload: FirmsHotspotsPayload = {
    data: deduped.sort((a, b) => b.brightness - a.brightness),
    region,
    window: windowParam,
    fetchedAt: new Date().toISOString(),
    rawCount: deduped.length,
  };

  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey !== undefined) responseCache.delete(oldestKey);
  }
  responseCache.set(cacheKey, { payload, expiresAt: now + CACHE_TTL_MS });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
      "X-Cache": "MISS",
    },
  });
}
