import { NextResponse } from "next/server";
import type { MultiPolygon, Polygon } from "geojson";
import { booleanPointInPolygon } from "@turf/turf";

// Administrative areas containing a point, from OpenStreetMap Nominatim.
//   GET ?lat&lng                → the place's real hierarchy (country → … → village), one lookup
//   GET ?lat&lng&level&name     → the border polygon of one of those levels
// Proxied + cached here to respect Nominatim's usage policy (identifying UA, ≤1 req/s, caching).

export interface AdminLevel {
  key: string; // Nominatim address key: country, region, state, province, county, city, town, village…
  label: string; // what we show, e.g. "Province"
  name: string; // e.g. "Bukidnon"
}

export interface LevelsPayload {
  levels: AdminLevel[]; // largest → smallest
  defaultKey: string | null;
}

export interface BoundaryPayload {
  name: string | null;
  kind: string | null;
  geometry: Polygon | MultiPolygon | null; // null when that level has no mapped border here
  bbox: [number, number, number, number] | null; // [west, south, east, north]
}

// Largest → smallest. Each key: label, reverse-geocode zooms to try (most likely first), outline detail.
const LEVELS: { key: string; label: (cc: string) => string; zooms: number[]; detail: number }[] = [
  { key: "country", label: () => "Country", zooms: [3], detail: 0.02 },
  { key: "region", label: () => "Region", zooms: [5, 4, 6], detail: 0.005 },
  // In the Philippines OSM tags provinces (e.g. Bukidnon) as "state".
  { key: "state", label: (cc) => (cc === "ph" ? "Province" : "State"), zooms: [5, 6, 7], detail: 0.005 },
  { key: "province", label: () => "Province", zooms: [7, 6, 8], detail: 0.002 },
  { key: "state_district", label: () => "District", zooms: [7, 8], detail: 0.002 },
  { key: "county", label: () => "County", zooms: [8, 9, 7], detail: 0.001 },
  { key: "municipality", label: () => "Municipality", zooms: [10, 9, 12], detail: 0.0005 },
  { key: "city", label: () => "City", zooms: [10, 12, 8], detail: 0.0005 },
  { key: "town", label: () => "Town", zooms: [10, 12, 13], detail: 0.0005 },
  { key: "village", label: (cc) => (cc === "ph" ? "Barangay" : "Village"), zooms: [13, 14, 12, 15], detail: 0.0003 },
  { key: "city_district", label: () => "District", zooms: [12, 14, 13], detail: 0.0003 },
  { key: "suburb", label: () => "Suburb", zooms: [14, 15, 16], detail: 0.0003 },
];
const DEFAULT_ORDER = ["city", "town", "municipality", "village", "county", "state"];

const cache = new Map<string, unknown>();
const MAX_CACHE = 500;
let nextSlot = 0;

async function nominatim(path: string): Promise<unknown> {
  const hit = cache.get(path);
  if (hit) return hit;
  // shortcut: in-process throttle only; with several server instances, use a shared limiter.
  const slot = Math.max(Date.now(), nextSlot);
  nextSlot = slot + 1100;
  if (slot > Date.now()) await new Promise((r) => setTimeout(r, slot - Date.now()));
  const res = await fetch(`https://nominatim.openstreetmap.org/${path}`, {
    headers: { "User-Agent": "EMBER-fire-monitor/0.1", "Accept-Language": "en" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
  const body = await res.json();
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(path, body);
  return body;
}

type Box = [number, number, number, number];

/**
 * Extent of the area for the weather grid and the map zoom, measured around the picked point so
 * countries crossing the dateline (e.g. the US with the Aleutians) don't become 360° wide. If the
 * parts are still spread over > 60° of longitude, use the landmass that contains the point.
 */
function areaBbox(geom: Polygon | MultiPolygon, lat: number, lng: number): Box {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const wrap = (x: number) => x - 360 * Math.round((x - lng) / 360); // into [lng-180, lng+180]
  const boxes: Box[] = polys.map((poly) => {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [x, y] of poly[0]!) {
      const wx = wrap(x!);
      w = Math.min(w, wx); e = Math.max(e, wx); s = Math.min(s, y!); n = Math.max(n, y!);
    }
    return [w, s, e, n];
  });
  const all: Box = [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
  if (all[2] - all[0] <= 60) return all;
  const home = polys.findIndex((p) => booleanPointInPolygon([lng, lat], { type: "Polygon", coordinates: p }));
  if (home >= 0) return boxes[home]!;
  const size = (b: Box) => (b[2] - b[0]) * (b[3] - b[1]);
  return boxes.reduce((a, b) => (size(b) > size(a) ? b : a));
}

const contains = (geom: Polygon | MultiPolygon, lat: number, lng: number) =>
  booleanPointInPolygon([lng, lat], geom);

const same = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "lat/lng out of range" }, { status: 400 });
  }
  const at = `lat=${lat.toFixed(4)}&lon=${lng.toFixed(4)}`;

  try {
    // Exact area picked from search, by its OSM id (e.g. R48393 = Bukidnon province).
    const osm = params.get("osm");
    if (osm) {
      if (!/^[NWR]\d{1,12}$/.test(osm)) return NextResponse.json({ error: "bad osm id" }, { status: 400 });
      const detail = { Country: 0.02, Region: 0.005, State: 0.005, Province: 0.005, County: 0.001 }[params.get("kind") ?? ""] ?? 0.0005;
      const [r] = (await nominatim(`lookup?osm_ids=${osm}&format=jsonv2&polygon_geojson=1&polygon_threshold=${detail}`)) as {
        name?: string;
        addresstype?: string;
        geojson?: { type?: string };
      }[];
      const geom = r?.geojson;
      if (r && (geom?.type === "Polygon" || geom?.type === "MultiPolygon")) {
        const geometry = geom as Polygon | MultiPolygon;
        return NextResponse.json({ name: r.name ?? null, kind: r.addresstype ?? null, geometry, bbox: areaBbox(geometry, lat, lng) } satisfies BoundaryPayload);
      }
      // Mapped as a point only (many villages/barangays): no border to cover.
      return NextResponse.json({ name: r?.name ?? null, kind: r?.addresstype ?? null, geometry: null, bbox: null } satisfies BoundaryPayload);
    }

    const levelKey = params.get("level");
    if (!levelKey) {
      // The place's real hierarchy, in one lookup.
      const body = (await nominatim(`reverse?${at}&zoom=18&format=jsonv2&addressdetails=1`)) as {
        address?: Record<string, string>;
      };
      const addr = body.address ?? {};
      const cc = (addr.country_code ?? "").toLowerCase();
      const seen = new Set<string>();
      const levels: AdminLevel[] = [];
      for (const l of LEVELS) {
        const name = addr[l.key];
        if (!name) continue;
        // e.g. Stahnsdorf is both town and city_district → offer it once, at the larger level
        if (seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        levels.push({ key: l.key, label: l.label(cc), name });
      }
      const defaultKey = DEFAULT_ORDER.find((k) => levels.some((l) => l.key === k)) ?? levels.at(-1)?.key ?? null;
      return NextResponse.json({ levels, defaultKey } satisfies LevelsPayload);
    }

    // Border of one level: try that level's usual zooms and keep the result whose name matches.
    const spec = LEVELS.find((l) => l.key === levelKey);
    const wanted = params.get("name") ?? "";
    if (!spec || !wanted) return NextResponse.json({ error: "unknown level or missing name" }, { status: 400 });
    type Hit = { name?: string; addresstype?: string; geojson?: { type?: string } };
    const found = (r: Hit) => {
      const geometry = r.geojson as Polygon | MultiPolygon;
      return NextResponse.json({ name: r.name!, kind: r.addresstype ?? null, geometry, bbox: areaBbox(geometry, lat, lng) } satisfies BoundaryPayload);
    };
    const isArea = (r: Hit) => r.geojson?.type === "Polygon" || r.geojson?.type === "MultiPolygon";

    // 1) Reverse lookup at that level's usual zooms (the result always contains the point).
    for (const zoom of spec.zooms) {
      const r = (await nominatim(
        `reverse?${at}&zoom=${zoom}&format=jsonv2&polygon_geojson=1&polygon_threshold=${spec.detail}`,
      )) as Hit;
      if (same(r.name, wanted) && isArea(r)) return found(r);
    }

    // 2) Search by name within the country (finds levels reverse skips, e.g. PH regions). Only accept a
    //    border that contains the picked point, so a same-named place elsewhere can never be used.
    const addr = ((await nominatim(`reverse?${at}&zoom=18&format=jsonv2&addressdetails=1`)) as { address?: Record<string, string> })
      .address;
    const cc = addr?.country_code ? `&countrycodes=${addr.country_code}` : "";
    const results = (await nominatim(
      `search?q=${encodeURIComponent(wanted)}${cc}&format=jsonv2&limit=8&polygon_geojson=1&polygon_threshold=${spec.detail}`,
    )) as Hit[];
    const match = results.find((r) => same(r.name, wanted) && isArea(r) && contains(r.geojson as Polygon | MultiPolygon, lat, lng));
    if (match) return found(match);

    // Mapped only as a point (common for barangays/villages) or not at all: no border to cover.
    return NextResponse.json({ name: wanted, kind: levelKey, geometry: null, bbox: null } satisfies BoundaryPayload);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
