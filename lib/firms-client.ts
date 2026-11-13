import type { Hotspot } from "./hotspots";

// Browser-side wrapper for the server-only /api/firms route (the MAP_KEY never leaves the server).
export async function fetchFirmsHotspots(): Promise<Hotspot[]> {
  const res = await fetch("/api/firms");
  const body = (await res.json()) as { data?: Hotspot[]; error?: string };
  if (!res.ok || body.error) throw new Error(body.error ?? `FIRMS proxy responded ${res.status}`);
  return body.data ?? [];
}
