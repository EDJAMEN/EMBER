import type { Confidence, Hotspot } from "./hotspots";

export interface FirmsWfsResponse {
  data: Hotspot[];
  region: "SouthEast_Asia" | "Global";
  window: "24h" | "7d";
  fetchedAt: string;
  rawCount: number;
}

export interface ClusteredHotspot extends Hotspot {
  highConfidenceCount: number;
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

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

// Browser-side wrapper for the server-only /api/firms/hotspots WFS GeoJSON proxy.
export async function fetchFirmsWfsHotspots(params: {
  bbox: [number, number, number, number];
  window: "24h" | "7d";
}): Promise<FirmsWfsResponse> {
  const qs = new URLSearchParams({
    bbox: params.bbox.map((n) => n.toFixed(3)).join(","),
    window: params.window,
  });
  const res = await fetch(`/api/firms/hotspots?${qs.toString()}`);
  const body = (await res.json()) as Partial<FirmsWfsResponse> & { error?: string };
  if (!res.ok || body.error) {
    throw new Error(body.error ?? `FIRMS WFS proxy responded ${res.status}`);
  }
  return {
    data: body.data ?? [],
    region: body.region ?? "SouthEast_Asia",
    window: body.window ?? params.window,
    fetchedAt: body.fetchedAt ?? new Date().toISOString(),
    rawCount: body.rawCount ?? (body.data?.length ?? 0),
  };
}

/**
 * Group nearby live detections into spatial clusters, compute total thermal pixel
 * counts per cluster, and rank by confidence & proximity.
 */
export function clusterHotspots(detections: Hotspot[], radiusKm = 2.5): ClusteredHotspot[] {
  if (detections.length === 0) return [];

  const sorted = [...detections].sort((a, b) => b.brightness - a.brightness);
  const groups: Hotspot[][] = [];

  for (const det of sorted) {
    let matched: Hotspot[] | null = null;
    for (const group of groups) {
      const anchor = group[0]!;
      if (haversineKm(det.lat, det.lng, anchor.lat, anchor.lng) <= radiusKm) {
        matched = group;
        break;
      }
    }
    if (matched) {
      matched.push(det);
    } else {
      groups.push([det]);
    }
  }

  const clusters: ClusteredHotspot[] = groups.map((group, idx) => {
    const lead = group[0]!;
    const count = group.reduce((sum, item) => sum + item.count, 0);
    const highConfidenceCount = group.filter((item) => item.confidence === "high").length;
    const avgLat = group.reduce((sum, item) => sum + item.lat, 0) / group.length;
    const avgLng = group.reduce((sum, item) => sum + item.lng, 0) / group.length;

    let bestConfidence: Confidence = lead.confidence;
    let minProximity = lead.proximityKm;
    let closestItem = lead;
    for (const item of group) {
      if (CONFIDENCE_RANK[item.confidence] > CONFIDENCE_RANK[bestConfidence]) {
        bestConfidence = item.confidence;
      }
      if (item.proximityKm < minProximity) {
        minProximity = item.proximityKm;
        closestItem = item;
      }
    }

    const baseName =
      closestItem.municipality !== "Regional"
        ? `${closestItem.municipality} cluster`
        : lead.name;

    return {
      ...lead,
      id: 20000 + idx,
      name: baseName,
      lat: Math.round(avgLat * 10000) / 10000,
      lng: Math.round(avgLng * 10000) / 10000,
      confidence: bestConfidence,
      proximityKm: closestItem.proximityKm,
      settlement: closestItem.settlement,
      municipality: closestItem.municipality,
      count,
      highConfidenceCount,
    };
  });

  return clusters.sort((a, b) => {
    const confDiff = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (confDiff !== 0) return confDiff;
    const proxDiff = a.proximityKm - b.proximityKm;
    if (proxDiff !== 0) return proxDiff;
    return b.count - a.count;
  });
}
