// Temperature / heat-index grid around a place, colored with the "Max Heat Index" scale (°C).
import { area, feature, featureCollection, intersect, isobands, point } from "@turf/turf";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { heatIndexC } from "./action-guide";

// [lower bound °C, color] — ticks 0,5,10,15,20,27,33,40,50 match the reference legend.
export const HEAT_SCALE: [number, string][] = [
  [-Infinity, "#ffffff"],
  [5, "#cfe8ff"],
  [10, "#9fd0ff"],
  [15, "#4fa3f7"],
  [20, "#26d9b5"],
  [27, "#3cc83c"],
  [33, "#ffe600"],
  [40, "#ff8c1a"],
  [46, "#e3211c"],
  [50, "#7f0a0a"],
];
export const HEAT_TICKS = [0, 5, 10, 15, 20, 27, 33, 40, 50];

export function heatColor(c: number): string {
  let color = HEAT_SCALE[0]![1];
  for (const [min, col] of HEAT_SCALE) if (c >= min) color = col;
  return color;
}

/** Max heat index over a day of hourly temperature (°C) + relative humidity (%). */
export function maxHeatIndex(temps: (number | null)[], rhs: (number | null)[]): number | null {
  let max: number | null = null;
  temps.forEach((t, i) => {
    const rh = rhs[i];
    if (typeof t !== "number" || typeof rh !== "number") return;
    const hi = heatIndexC(t, rh);
    if (max === null || hi > max) max = hi;
  });
  return max;
}

export interface GridCell {
  lat: number;
  lng: number;
  tempC: number | null;
  maxHeatIndexC: number | null;
}

export const GRID_STEP_DEG = 0.15; // point mode: 7×7 cells ≈ 100 km square
const GRID_HALF = 3;
const AREA_N = 9; // area mode: 9×9 points spread over the selected area's extent

/** Grid points: a ~100 km square around the point, or — given an area's [w, s, e, n] — spread over that area. */
export function gridPoints(lat: number, lng: number, bbox?: [number, number, number, number] | null) {
  const pts: { lat: number; lng: number }[] = [];
  if (bbox) {
    let [w, s, e, n] = bbox;
    // Pad a little, and give tiny villages a minimum span so the contours still have room to form.
    const padLng = Math.max((e - w) * 0.06, (0.12 - (e - w)) / 2, 0);
    const padLat = Math.max((n - s) * 0.06, (0.12 - (n - s)) / 2, 0);
    w -= padLng; e += padLng; s = Math.max(-89.9, s - padLat); n = Math.min(89.9, n + padLat);
    for (let i = 0; i < AREA_N; i++)
      for (let j = 0; j < AREA_N; j++)
        pts.push({
          lat: Number((s + ((n - s) * i) / (AREA_N - 1)).toFixed(4)),
          lng: Number((w + ((e - w) * j) / (AREA_N - 1)).toFixed(4)),
        });
    return pts;
  }
  for (let i = -GRID_HALF; i <= GRID_HALF; i++)
    for (let j = -GRID_HALF; j <= GRID_HALF; j++)
      pts.push({
        lat: Number(Math.max(-89.9, Math.min(89.9, lat + i * GRID_STEP_DEG)).toFixed(4)),
        lng: Number((lng + j * GRID_STEP_DEG).toFixed(4)), // left unwrapped so the grid stays regular
      });
  return pts;
}

const wrapLng = (x: number) => Number((((((x + 180) % 360) + 360) % 360) - 180).toFixed(4));

export async function fetchHeatGrid(
  lat: number,
  lng: number,
  bbox?: [number, number, number, number] | null,
): Promise<GridCell[]> {
  const pts = gridPoints(lat, lng, bbox);
  try {
    return await fetchOpenMeteoGrid(pts);
  } catch {
    // Open-Meteo refused (its free quota is per network) or is down: same grid from NOAA GFS via our server.
    const res = await fetch(`/api/climate?points=${pts.map((p) => `${p.lat},${wrapLng(p.lng)}`).join(";")}`);
    const body = (await res.json()) as { points?: { tempC: number; maxHeatIndexC: number }[]; error?: string };
    if (!res.ok || !body.points) throw new Error(body.error ?? `climate ${res.status}`);
    return pts.map((p, i) => ({ ...p, tempC: body.points![i]?.tempC ?? null, maxHeatIndexC: body.points![i]?.maxHeatIndexC ?? null }));
  }
}

async function fetchOpenMeteoGrid(pts: { lat: number; lng: number }[]): Promise<GridCell[]> {
  // One multi-location request (Open-Meteo returns an array in the same order).
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${pts.map((p) => p.lat).join(",")}&longitude=${pts
      .map((p) => wrapLng(p.lng))
      .join(",")}&current=temperature_2m&hourly=temperature_2m,relative_humidity_2m&forecast_days=1&timezone=auto`,
  );
  if (!res.ok) throw new Error(`grid ${res.status}`);
  const body = (await res.json()) as {
    current?: { temperature_2m?: number };
    hourly?: { temperature_2m?: (number | null)[]; relative_humidity_2m?: (number | null)[] };
  }[];
  return pts.map((p, idx) => {
    const r = body[idx];
    return {
      ...p,
      tempC: typeof r?.current?.temperature_2m === "number" ? r.current.temperature_2m : null,
      maxHeatIndexC: maxHeatIndex(r?.hourly?.temperature_2m ?? [], r?.hourly?.relative_humidity_2m ?? []),
    };
  });
}

export type GridMetric = "tempC" | "maxHeatIndexC";
export type AreaProps = { color: string; label: string };

/** Rounded [min, max] of a metric across the grid, for the slider's range. */
export function gridDomain(cells: GridCell[], metric: GridMetric): [number, number] | null {
  const vals = cells.map((c) => c[metric]).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const lo = Math.floor(Math.min(...vals));
  const hi = Math.ceil(Math.max(...vals));
  return [lo, hi === lo ? lo + 1 : hi];
}

const SMOOTH = 4; // bilinear upsampling factor: 7×7 → 25×25 so contour edges read as curves, not blocks

/**
 * Contour areas whose value lies in [lo, hi], split at the color-scale edges so each band
 * keeps its legend color. Also returns the share of the grid area covered.
 */
export function contourAreas(
  cells: GridCell[],
  metric: GridMetric,
  lo: number,
  hi: number,
): { areas: FeatureCollection<MultiPolygon, AreaProps>; coverage: number } {
  const n = Math.round(Math.sqrt(cells.length));
  const empty = { areas: featureCollection<MultiPolygon, AreaProps>([]), coverage: 0 };
  if (n < 2 || n * n !== cells.length) return empty;

  const raw = cells.map((c) => c[metric]);
  const known = raw.filter((v): v is number => v !== null);
  if (!known.length) return empty;
  const fill = known.reduce((a, b) => a + b, 0) / known.length; // rare gaps: use the mean
  const v = (i: number, j: number) => raw[i * n + j] ?? fill;

  const lat0 = cells[0]!.lat;
  const lng0 = cells[0]!.lng;
  // Spacing comes from the cells themselves: fixed for the 100 km square, area-sized otherwise.
  const stepLat = (cells[n]!.lat - lat0) / SMOOTH;
  const stepLng = (cells[1]!.lng - lng0) / SMOOTH;
  const size = (n - 1) * SMOOTH + 1;
  const pts = [];
  let inside = 0;
  for (let I = 0; I < size; I++) {
    for (let J = 0; J < size; J++) {
      const fi = I / SMOOTH;
      const fj = J / SMOOTH;
      const i0 = Math.min(Math.floor(fi), n - 2);
      const j0 = Math.min(Math.floor(fj), n - 2);
      const ti = fi - i0;
      const tj = fj - j0;
      const z =
        v(i0, j0) * (1 - ti) * (1 - tj) +
        v(i0 + 1, j0) * ti * (1 - tj) +
        v(i0, j0 + 1) * (1 - ti) * tj +
        v(i0 + 1, j0 + 1) * ti * tj;
      if (z >= lo && z <= hi) inside++;
      // lng not re-wrapped so the grid stays regular across the dateline (Leaflet draws >180 fine)
      pts.push(point([lng0 + J * stepLng, lat0 + I * stepLat], { z }));
    }
  }

  const top = hi > lo ? hi : lo + 0.5;
  const bottom = hi > lo ? lo : lo - 0.5;
  const breaks = [bottom, ...HEAT_SCALE.map(([min]) => min).filter((m) => m > bottom && m < top), top];
  const bands = isobands(featureCollection(pts), breaks, { zProperty: "z" });
  const features = bands.features.flatMap((f, k) => {
    if (!f.geometry.coordinates.length) return [];
    const a = breaks[k]!;
    const b = breaks[k + 1]!;
    return [{ ...f, properties: { color: heatColor((a + b) / 2), label: `${Math.round(a)}–${Math.round(b)}°C` } }];
  });
  return { areas: featureCollection(features), coverage: inside / (size * size) };
}

/**
 * Keep only the parts of the contour areas inside the place's boundary (e.g. Valencia City),
 * and re-express coverage as the share of that place covered.
 */
export function clipToBoundary(
  areas: FeatureCollection<MultiPolygon, AreaProps>,
  boundary: Polygon | MultiPolygon,
): { areas: FeatureCollection<MultiPolygon, AreaProps>; coverage: number } {
  const shape = feature(boundary);
  const total = area(shape);
  let covered = 0;
  const features = areas.features.flatMap((band) => {
    const clipped = intersect(featureCollection([band, shape]));
    if (!clipped) return [];
    covered += area(clipped);
    const geometry: MultiPolygon =
      clipped.geometry.type === "Polygon"
        ? { type: "MultiPolygon", coordinates: [clipped.geometry.coordinates] }
        : clipped.geometry;
    return [{ type: "Feature" as const, geometry, properties: band.properties }];
  });
  return { areas: featureCollection(features), coverage: total > 0 ? Math.min(1, covered / total) : 0 };
}
