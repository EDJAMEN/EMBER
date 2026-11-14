// Live global wind (NOAA GFS, 10 m, via /api/wind) for the wind animation, and a wind-driven fire-spread estimate.
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";

/** A regular global lat/lon wind grid, row 0 = northernmost latitude, columns eastward from lng1 (GFS layout). */
export interface WindField {
  ni: number; // columns (longitudes)
  nj: number; // rows (latitudes)
  lat1: number; // latitude of row 0, e.g. 90
  lng1: number; // longitude of column 0, e.g. 0
  step: number; // grid spacing in degrees
  u: Float32Array; // m/s toward east
  v: Float32Array; // m/s toward north
  validTime: string; // ISO time the wind is for
  run: string; // model run, e.g. "GFS 2026-11-14 06Z"
}

// Wind-speed colours (km/h), calm blue → gale magenta, like common wind maps.
export const WIND_SCALE: [number, string][] = [
  [0, "#3b4cc0"], [10, "#3a8fd0"], [20, "#36b5a6"], [30, "#6cc24a"], [40, "#e0cf35"], [55, "#f08a2c"], [70, "#d9342b"], [90, "#a3247e"],
];

/** Smoothly interpolated legend colour for a wind speed (km/h), as [r, g, b]. */
export function windRgb(kmh: number): [number, number, number] {
  const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  const last = WIND_SCALE[WIND_SCALE.length - 1]!;
  if (kmh >= last[0]) return hex(last[1]);
  for (let i = 0; i < WIND_SCALE.length - 1; i++) {
    const [a, ca] = WIND_SCALE[i]!, [b, cb] = WIND_SCALE[i + 1]!;
    if (kmh < b) {
      const t = Math.max(0, (kmh - a) / (b - a)), x = hex(ca), y = hex(cb);
      return [0, 1, 2].map((k) => Math.round(x[k]! + (y[k]! - x[k]!) * t)) as [number, number, number];
    }
  }
  return hex(last[1]);
}

const KM_PER_DEG = 111.32;
const rad = (d: number) => (d * Math.PI) / 180;

/** Wind as a vector pointing where it blows TO, in km/h: u = east, v = north. */
export function windVector(speedKmh: number, dirFrom: number): { u: number; v: number } {
  return { u: -speedKmh * Math.sin(rad(dirFrom)), v: -speedKmh * Math.cos(rad(dirFrom)) };
}

/** Bilinear wind (km/h, u east / v north) anywhere on Earth; longitudes wrap, so the whole map is covered. */
export function sampleWind(f: Pick<WindField, "ni" | "nj" | "lat1" | "lng1" | "step" | "u" | "v">, lat: number, lng: number) {
  const fy = Math.max(0, Math.min(f.nj - 1, (f.lat1 - lat) / f.step));
  const fx = ((((lng - f.lng1) / f.step) % f.ni) + f.ni) % f.ni;
  const y0 = Math.min(Math.floor(fy), f.nj - 2), x0 = Math.floor(fx) % f.ni, x1 = (x0 + 1) % f.ni;
  const ty = fy - y0, tx = fx - Math.floor(fx);
  const at = (arr: Float32Array, y: number, x: number) => arr[y * f.ni + x]!;
  const mix = (arr: Float32Array) =>
    (at(arr, y0, x0) * (1 - tx) + at(arr, y0, x1) * tx) * (1 - ty) + (at(arr, y0 + 1, x0) * (1 - tx) + at(arr, y0 + 1, x1) * tx) * ty;
  return { u: mix(f.u) * 3.6, v: mix(f.v) * 3.6 };
}

const fromB64 = (s: string) => {
  const bin = atob(s);
  const i16 = new Int16Array(bin.length / 2);
  for (let k = 0; k < i16.length; k++) i16[k] = (bin.charCodeAt(2 * k) | (bin.charCodeAt(2 * k + 1) << 8)) << 16 >> 16;
  return Float32Array.from(i16, (x) => x / 100); // sent as centimetres per second
};

/** The whole planet's current wind, decoded by the server from NOAA GFS (refreshed with each model run). */
export async function fetchWindField(): Promise<WindField> {
  const res = await fetch("/api/wind");
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error ?? `wind ${res.status}`);
  return { ...body, u: fromB64(body.u), v: fromB64(body.v) };
}

export interface FireWind {
  lat: number;
  lng: number;
  hourly: { speedKmh: number; dirFrom: number }[]; // next hours, starting now
}

/** GFS hourly wind for the next 6 h at each fire (one server call, no per-point weather quota). */
export async function fetchFireWinds(fires: { lat: number; lng: number }[]): Promise<FireWind[]> {
  if (!fires.length) return [];
  const pts = fires.map((f) => `${f.lat.toFixed(3)},${f.lng.toFixed(3)}`).join(";");
  const res = await fetch(`/api/wind?points=${encodeURIComponent(pts)}`);
  const body = await res.json();
  if (!res.ok || body.error) throw new Error(body.error ?? `fire wind ${res.status}`);
  return fires.map((f, i) => ({ ...f, hourly: body.points[i] ?? [] }));
}

export const SPREAD_HOURS = [1, 3, 6] as const;

/**
 * Wind-driven spread estimate after `hours`, as an ellipse with the fire at its rear focus.
 * - Head-fire rate of spread ≈ 10 % of the 10 m wind speed (Cruz & Alexander 2019 "10 % rule" for forests).
 * - Ellipse length-to-breadth from wind speed (Anderson 1983), so stronger wind → longer, narrower shape.
 * - Direction and speed are the vector mean of the forecast hours, so a turning wind bends the estimate.
 * Ignores fuel, slope and moisture: an indicator of where the fire is being pushed, not a fire-behaviour model.
 */
export function spreadEllipse(
  lat: number,
  lng: number,
  hourly: { speedKmh: number; dirFrom: number }[],
  hours: number,
): { polygon: Polygon; head: [number, number]; headKm: number; meanSpeed: number; towardDeg: number } | null {
  const hs = hourly.slice(0, Math.max(1, hours));
  if (!hs.length) return null;
  let su = 0, sv = 0;
  for (const h of hs) {
    const { u, v } = windVector(h.speedKmh, h.dirFrom);
    su += u; sv += v;
  }
  su /= hs.length; sv /= hs.length;
  const U = Math.hypot(su, sv); // km/h
  const towardDeg = ((Math.atan2(su, sv) * 180) / Math.PI + 360) % 360;
  const headKm = Math.max(0.1 * U * hours, 0.05 * hours); // calm air still creeps outward a little
  const mph = (U * 0.4) / 1.609; // Anderson's formula wants mid-flame wind: ~0.4 × the 10 m wind
  const lb = Math.min(8, Math.max(1, 0.936 * Math.exp(0.2566 * mph) + 0.461 * Math.exp(-0.1548 * mph) - 0.397));
  const root = Math.sqrt(lb * lb - 1);
  const backKm = root > 0 ? headKm * ((lb - root) / (lb + root)) : headKm; // back:head ratio
  const a = (headKm + backKm) / 2; // semi-major, along the wind
  const b = a / lb; // semi-minor
  const offset = headKm - a; // ellipse centre, downwind of the fire
  const t = rad(towardDeg);
  const cosLat = Math.max(0.05, Math.cos(rad(lat)));
  const toLngLat = (along: number, across: number): [number, number] => {
    const east = along * Math.sin(t) + across * Math.cos(t);
    const north = along * Math.cos(t) - across * Math.sin(t);
    return [lng + east / (KM_PER_DEG * cosLat), lat + north / KM_PER_DEG];
  };
  const ring: [number, number][] = [];
  for (let k = 0; k <= 48; k++) {
    const th = (2 * Math.PI * k) / 48;
    ring.push(toLngLat(offset + a * Math.cos(th), b * Math.sin(th)));
  }
  ring[48] = ring[0]!;
  return { polygon: { type: "Polygon", coordinates: [ring] }, head: toLngLat(headKm, 0), headKm, meanSpeed: U, towardDeg };
}

export type SpreadProps = { hours: number; label: string; toward?: number; speed?: number };

/** Spread ellipses (largest first, so smaller horizons draw on top) plus a fire → 6 h head track line. */
export function spreadFeatures(winds: FireWind[]): FeatureCollection<Polygon | LineString | Point, SpreadProps> {
  const features: Feature<Polygon | LineString | Point, SpreadProps>[] = [];
  for (const f of winds) {
    // Direction arrow at the fire (visible at any zoom, unlike a few-km ellipse): next-3 h push.
    const push = spreadEllipse(f.lat, f.lng, f.hourly, 3);
    if (push) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [f.lng, f.lat] },
        properties: {
          hours: 0,
          toward: Math.round(push.towardDeg),
          speed: Math.round(push.meanSpeed),
          label: `Pushed toward ${compassOf(push.towardDeg)} by ${Math.round(push.meanSpeed)} km/h wind · ~${push.headKm.toFixed(1)} km in 3 h`,
        },
      });
    }
    for (const h of [...SPREAD_HOURS].reverse()) {
      const e = spreadEllipse(f.lat, f.lng, f.hourly, h);
      if (!e) continue;
      const label = `+${h} h · up to ${e.headKm.toFixed(1)} km toward ${compassOf(e.towardDeg)} · wind ${Math.round(e.meanSpeed)} km/h`;
      features.push({ type: "Feature", geometry: e.polygon, properties: { hours: h, label } });
      if (h === 6) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: [[f.lng, f.lat], e.head] }, properties: { hours: h, label } });
    }
  }
  return { type: "FeatureCollection", features };
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const compassOf = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;

/**
 * Keep an already-loaded [s, w, n, e] box when the new view still lies inside it, so zooming in or a small
 * pan doesn't refetch (or blank the map while it loads). `minFrac`: refetch anyway once the view is smaller
 * than this share of the box, so a coarse grid gets replaced by a finer one after a deep zoom.
 */
export function keepBox(
  box: [number, number, number, number],
  view: [number, number, number, number],
  minFrac = 0,
): boolean {
  const inside = view[0] >= box[0] && view[1] >= box[1] && view[2] <= box[2] && view[3] <= box[3];
  const span = (b: [number, number, number, number]) => Math.max(b[2] - b[0], b[3] - b[1]);
  return inside && span(view) >= span(box) * minFrac;
}
