// Which fires belong to a chosen area: inside its border, or — when it has none — the ones just outside it.
import type { MultiPolygon, Polygon } from "geojson";

export const NEARBY_KM = 30; // a wind-driven fire can cover this in well under a day in strong wind

type InFn = (pt: [number, number], area: Polygon | MultiPolygon) => boolean;
type DistFn = (pt: [number, number], area: Polygon | MultiPolygon, opts: { units: "kilometers" }) => number;

/**
 * Fires inside the border; if there are none, those within NEARBY_KM of it (`nearby: true`).
 * The turf functions are passed in so this stays testable without a bundler.
 */
export function splitByBorder<T extends { lat: number; lng: number }>(
  fires: T[],
  border: Polygon | MultiPolygon,
  inside: InFn,
  distance: DistFn,
): { fires: T[]; nearby: boolean } {
  const within = fires.filter((f) => inside([f.lng, f.lat], border));
  if (within.length) return { fires: within, nearby: false };
  const close = fires.filter((f) => distance([f.lng, f.lat], border, { units: "kilometers" }) <= NEARBY_KM);
  return { fires: close, nearby: close.length > 0 };
}
