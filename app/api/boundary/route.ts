import { NextResponse } from "next/server";
import type { MultiPolygon, Polygon } from "geojson";

// Administrative boundary (city / municipality) containing a point, from OpenStreetMap Nominatim.
// Proxied + cached here so we respect Nominatim's usage policy (identifying UA, ≤1 req/s, caching).

export interface BoundaryPayload {
  name: string | null;
  kind: string | null; // e.g. "city", "town", "municipality"
  geometry: Polygon | MultiPolygon | null; // null when no admin area polygon exists there
}

const cache = new Map<string, BoundaryPayload>();
const MAX_CACHE = 300;
let lastCall = 0;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "lat/lng out of range" }, { status: 400 });
  }

  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`; // ~100 m: nearby clicks share one lookup
  const hit = cache.get(key);
  if (hit) return NextResponse.json(hit);

  // shortcut: in-process throttle only; with several server instances, use a shared limiter.
  const wait = lastCall + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  try {
    const res = await fetch(
      // zoom=10 → city/municipality level; polygon_threshold simplifies the outline (~50 m).
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&zoom=10&format=geojson&polygon_geojson=1&polygon_threshold=0.0005`,
      { headers: { "User-Agent": "EMBER-fire-monitor/0.1", "Accept-Language": "en" }, next: { revalidate: 86400 } },
    );
    if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
    const body = (await res.json()) as {
      features?: { geometry?: { type?: string }; properties?: { name?: string; addresstype?: string } }[];
    };
    const f = body.features?.[0];
    const geom = f?.geometry;
    const payload: BoundaryPayload = {
      name: f?.properties?.name ?? null,
      kind: f?.properties?.addresstype ?? null,
      geometry: geom?.type === "Polygon" || geom?.type === "MultiPolygon" ? (geom as Polygon | MultiPolygon) : null,
    };
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, payload);
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
