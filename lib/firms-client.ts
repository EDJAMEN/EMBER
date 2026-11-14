import type { Hotspot } from "./hotspots";

// Browser-side wrapper for the server-only /api/firms route (the MAP_KEY never leaves the server).
export async function fetchFirmsHotspots(near?: { lat: number; lng: number; name?: string }): Promise<Hotspot[]> {
  const params = near
    ? `?${new URLSearchParams({ lat: String(near.lat), lng: String(near.lng), name: near.name ?? "" })}`
    : "";
  const res = await fetch(`/api/firms${params}`);
  const body = (await res.json()) as { data?: Hotspot[]; error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `FIRMS proxy responded ${res.status}`);
  return body.data ?? [];
}
