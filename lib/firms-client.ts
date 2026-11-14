import type { Confidence, Hotspot, SensorSource } from "./hotspots";
import { normalizeConfidenceScore } from "./harmonization";

export interface FirmsWfsResponse {
  data: Hotspot[];
  region: "SouthEast_Asia" | "Global";
  window: "24h" | "7d";
  fetchedAt: string;
  rawCount: number;
  startDate?: string;
  endDate?: string;
  historical?: boolean;
  dataSource?: "firms-wfs" | "firms-area" | "historical-archive";
  eraNote?: string | null;
}

export interface ClusteredHotspot extends Hotspot {
  highConfidenceCount: number;
  isMultiSensor?: boolean;
  modisCount?: number;
  viirsCount?: number;
}

export interface HarmonizationComparisonStats {
  rawDetectionCount: number;
  rawPixelCount: number;
  modisRawCount: number;
  viirsRawCount: number;
  harmonizedClusterCount: number;
  mergedDuplicateCount: number;
  reductionPercent: number;
  dualSensorConfirmedCount: number;
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
  near?: { lat: number; lng: number; name: string } | null; // distances/names are measured from this place
  date?: string | null;
  days?: number;
  sensor?: "BOTH" | "VIIRS" | "MODIS";
}): Promise<FirmsWfsResponse> {
  const qs = new URLSearchParams({
    bbox: params.bbox.map((n) => n.toFixed(3)).join(","),
    window: params.window,
  });
  if (params.near) {
    qs.set("lat", String(params.near.lat));
    qs.set("lng", String(params.near.lng));
    qs.set("name", params.near.name);
  }
  if (params.date) {
    qs.set("date", params.date);
    if (params.days) qs.set("days", String(params.days));
    if (params.sensor) qs.set("sensor", params.sensor);
  }
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
    startDate: body.startDate,
    endDate: body.endDate,
    historical: body.historical,
    dataSource: body.dataSource,
    eraNote: body.eraNote,
  };
}

/**
 * Harmonizes nearby MODIS (1km) + VIIRS (375m) detections into unified spatial fire clusters,
 * computes FRP-weighted centroids, Bayesian multi-sensor confidence fusion, and dual-sensor attribution.
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

    let weightedLat = 0;
    let weightedLng = 0;
    let totalWeight = 0;
    let totalFrp = 0;
    let modisCount = 0;
    let viirsCount = 0;
    let nonDetectionProb = 1.0;

    let bestConfidence: Confidence = lead.confidence;
    let minProximity = lead.proximityKm;
    let closestItem = lead;

    for (const item of group) {
      const px = Math.max(1, item.count);
      const itemSources = item.sources ?? [item.source];
      if (itemSources.includes("MODIS") && itemSources.includes("VIIRS")) {
        const half = Math.max(1, Math.floor(px / 2));
        modisCount += half;
        viirsCount += px - half;
      } else if (item.source === "MODIS") {
        modisCount += px;
      } else {
        viirsCount += px;
      }

      const w = (item.frp && item.frp > 0 ? item.frp : Math.max(item.brightness - 273.15, 1)) * px;
      weightedLat += item.lat * w;
      weightedLng += item.lng * w;
      totalWeight += w;
      totalFrp += item.frp ?? 0;

      const cScore = normalizeConfidenceScore(item.source, item.rawConfidence);
      nonDetectionProb *= 1.0 - cScore;

      if (CONFIDENCE_RANK[item.confidence] > CONFIDENCE_RANK[bestConfidence]) {
        bestConfidence = item.confidence;
      }
      if (item.proximityKm < minProximity) {
        minProximity = item.proximityKm;
        closestItem = item;
      }
    }

    const isMultiSensor = modisCount > 0 && viirsCount > 0;
    const sources: SensorSource[] = isMultiSensor
      ? ["VIIRS", "MODIS"]
      : modisCount > 0
        ? ["MODIS"]
        : ["VIIRS"];

    let fusedProb = 1.0 - nonDetectionProb;
    if (isMultiSensor) fusedProb = Math.max(fusedProb, 0.96);
    const fusedConfidencePercent = Math.round(fusedProb * 100);
    const fusedConfidence: Confidence = isMultiSensor
      ? "high"
      : fusedConfidencePercent >= 80
        ? "high"
        : bestConfidence;

    const avgLat = totalWeight > 0 ? weightedLat / totalWeight : lead.lat;
    const avgLng = totalWeight > 0 ? weightedLng / totalWeight : lead.lng;

    // Bukidnon towns: "Valencia City cluster"; elsewhere the detection's own name, e.g. "12 km NE of Paris".
    const baseName = closestItem.settlement.startsWith("Near ")
      ? `${closestItem.municipality} cluster`
      : closestItem.name;

    return {
      ...lead,
      id: 20000 + idx,
      name: baseName,
      lat: Math.round(avgLat * 10000) / 10000,
      lng: Math.round(avgLng * 10000) / 10000,
      confidence: fusedConfidence,
      proximityKm: closestItem.proximityKm,
      settlement: closestItem.settlement,
      municipality: closestItem.municipality,
      count,
      highConfidenceCount: isMultiSensor ? Math.max(1, highConfidenceCount) : highConfidenceCount,
      isMultiSensor,
      sources,
      modisCount,
      viirsCount,
      fusedConfidencePercent,
      frp: totalFrp > 0 ? Math.round(totalFrp * 10) / 10 : lead.frp,
      rawConfidence: isMultiSensor
        ? `MODIS (${modisCount}) + VIIRS (${viirsCount}) harmonized`
        : lead.rawConfidence,
    };
  });

  return clusters.sort((a, b) => {
    const multiDiff = Number(Boolean(b.isMultiSensor)) - Number(Boolean(a.isMultiSensor));
    if (multiDiff !== 0) return multiDiff;
    const confDiff = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
    if (confDiff !== 0) return confDiff;
    const proxDiff = a.proximityKm - b.proximityKm;
    if (proxDiff !== 0) return proxDiff;
    return b.count - a.count;
  });
}

/**
 * Returns raw unharmonized satellite detections without cross-sensor merging so users can
 * directly compare raw overlapping MODIS (1km) & VIIRS (375m) pixels against harmonized clusters.
 */
export function unharmonizedHotspots(detections: Hotspot[]): ClusteredHotspot[] {
  return [...detections]
    .map((item, idx) => ({
      ...item,
      id: 50000 + idx,
      sources: [item.source],
      isMultiSensor: false,
      modisCount: item.source === "MODIS" ? item.count : 0,
      viirsCount: item.source === "VIIRS" ? item.count : 0,
      highConfidenceCount: item.confidence === "high" ? item.count : 0,
      fusedConfidencePercent: undefined,
    }))
    .sort((a, b) => b.brightness - a.brightness);
}

export function computeHarmonizationStats(
  rawDetections: Hotspot[],
  harmonizedClusters: ClusteredHotspot[],
): HarmonizationComparisonStats {
  let rawPixelCount = 0;
  let modisRawCount = 0;
  let viirsRawCount = 0;

  for (const d of rawDetections) {
    const px = Math.max(1, d.count);
    rawPixelCount += px;
    if (d.source === "MODIS") modisRawCount += px;
    else viirsRawCount += px;
  }

  const rawDetectionCount = Math.max(rawDetections.length, rawPixelCount);
  const harmonizedClusterCount = harmonizedClusters.length;
  const mergedDuplicateCount = Math.max(0, rawDetectionCount - harmonizedClusterCount);
  const reductionPercent =
    rawDetectionCount > 0 ? Math.round((mergedDuplicateCount / rawDetectionCount) * 100) : 0;
  const dualSensorConfirmedCount = harmonizedClusters.filter((c) => c.isMultiSensor).length;

  return {
    rawDetectionCount,
    rawPixelCount,
    modisRawCount,
    viirsRawCount,
    harmonizedClusterCount,
    mergedDuplicateCount,
    reductionPercent,
    dualSensorConfirmedCount,
  };
}
