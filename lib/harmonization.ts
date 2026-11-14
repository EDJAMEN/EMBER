import * as turf from "@turf/turf";
import type {
  Feature,
  Point,
  Polygon,
  FeatureCollection,
} from "geojson";
import type { Confidence, Hotspot, SensorSource } from "./hotspots";

export interface RawHotspotProperties {
  id: string | number;
  name?: string;
  source: SensorSource;
  confidence: number | string; // MODIS: 0-100 (numeric), VIIRS: "l" | "n" | "h" (categorical)
  brightness?: number; // Kelvin
  frp?: number; // Fire Radiative Power (MW)
  acq_date?: string;
  acq_time?: string;
  settlement?: string;
  municipality?: string;
  proximityKm?: number;
  dayOffset?: number;
  count?: number;
  [key: string]: unknown;
}

export interface FusedFireClusterProperties {
  cluster_id: string;
  member_ids: (string | number)[];
  name: string;
  primary_source: "MULTI_SENSOR" | SensorSource;
  sources: SensorSource[];
  is_multi_sensor: boolean;
  detection_count: number;
  modis_count: number;
  viirs_count: number;
  raw_confidence_summary: string;
  fused_confidence_percent: number;
  confidence: Confidence;
  max_brightness: number;
  total_frp: number;
  acq_date: string;
  acq_time: string;
  settlement: string;
  municipality: string;
  proximityKm: number;
  dayOffset: number;
  center_lon: number;
  center_lat: number;
}

export type RawFirePoint = Feature<Point, RawHotspotProperties>;
export type FusedFireFeature = Feature<Polygon | Point, FusedFireClusterProperties>;

export interface HarmonizedCluster extends Hotspot {
  isMultiSensor: boolean;
  sources: SensorSource[];
  fusedConfidencePercent: number;
  modisCount: number;
  viirsCount: number;
  totalFrp: number;
  detections: Hotspot[]; // original per-sensor detections, kept for traceability
  geometryType: "Point" | "Polygon";
  geoJsonPolygon?: Polygon | Point;
}

/**
 * Normalizes disparate sensor confidence ratings to a standard 0.0 - 1.0 probability.
 */
export function normalizeConfidenceScore(
  source: SensorSource,
  rawConfidence: number | string
): number {
  if (source === "VIIRS") {
    const val = String(rawConfidence).toLowerCase().trim();
    if (val.startsWith("h")) return 0.88;
    if (val.startsWith("n")) return 0.55;
    return 0.25; // 'l'
  }
  const num = typeof rawConfidence === "number" ? rawConfidence : parseFloat(String(rawConfidence));
  return Math.min(Math.max(isNaN(num) ? 50 : num, 0), 100) / 100;
}

/**
 * Ingests GeoJSON Point collection from both sensors, deduplicates points within clusterRadiusKm,
 * and fuses into unified fire clusters with boosted confidence.
 */
export function harmonizeFireGeoJson(
  features: RawFirePoint[],
  clusterRadiusKm = 1.0
): FeatureCollection<Polygon | Point, FusedFireClusterProperties> {
  const n = features.length;
  if (n === 0) return turf.featureCollection([]);

  // 1. Build adjacency graph using great-circle distance
  const adj: number[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = turf.distance(features[i], features[j], { units: "kilometers" });
      if (dist <= clusterRadiusKm) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  // 2. Discover Connected Components (Clusters) via BFS
  const visited = new Uint8Array(n);
  const clusters: RawFirePoint[][] = [];

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    visited[i] = 1;

    const cluster: RawFirePoint[] = [features[i]];
    const queue: number[] = [i];

    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const neighbor of adj[curr]) {
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          cluster.push(features[neighbor]);
          queue.push(neighbor);
        }
      }
    }
    clusters.push(cluster);
  }

  // 3. Synthesize and Fuse Cluster Geometry & Telemetry
  const fusedFeatures: FusedFireFeature[] = clusters.map((group, clusterIdx) => {
    let modisCount = 0;
    let viirsCount = 0;
    let maxBrightness = 0;
    let totalFrp = 0;
    const individualConfidences: number[] = [];
    // Cluster is stamped with its newest detection so it shows as current activity.
    let latestStamp = "";
    let latestDate = "";
    let latestTime = "";

    // FRP-weighted coordinates for true fire centroid
    let weightedLon = 0;
    let weightedLat = 0;
    let totalWeight = 0;

    // Use closest settlement info
    let minProximityKm = Infinity;
    let closestSettlement = "Unspecified Settlement";
    let closestMunicipality = "Bukidnon";
    let representativeName = `Cluster #${clusterIdx + 101}`;
    let maxDayOffset = -Infinity;

    for (const point of group) {
      const props = point.properties;
      const [lon, lat] = point.geometry.coordinates;

      if (props.source === "MODIS") modisCount++;
      if (props.source === "VIIRS") viirsCount++;

      const conf = normalizeConfidenceScore(props.source, props.confidence);
      individualConfidences.push(conf);

      const brightness = props.brightness ?? 300;
      if (brightness > maxBrightness) maxBrightness = brightness;

      const frp = props.frp ?? 0;
      totalFrp += frp;

      const weight = frp > 0 ? frp : Math.max(brightness - 273.15, 1);
      weightedLon += lon * weight;
      weightedLat += lat * weight;
      totalWeight += weight;

      const stamp = `${props.acq_date ?? ""} ${props.acq_time ?? ""}`;
      if (props.acq_date && stamp > latestStamp) {
        latestStamp = stamp;
        latestDate = props.acq_date;
        latestTime = props.acq_time ?? "";
      }

      if (typeof props.proximityKm === "number" && props.proximityKm < minProximityKm) {
        minProximityKm = props.proximityKm;
        if (props.settlement) closestSettlement = props.settlement;
        if (props.municipality) closestMunicipality = props.municipality;
      }
      if (props.name && representativeName.startsWith("Cluster")) {
        representativeName = props.name;
      }
      if (typeof props.dayOffset === "number" && props.dayOffset > maxDayOffset) {
        maxDayOffset = props.dayOffset;
      }
    }

    const centerLon = Number((weightedLon / (totalWeight || 1)).toFixed(6));
    const centerLat = Number((weightedLat / (totalWeight || 1)).toFixed(6));

    // Multi-sensor confidence formula: 1 - ∏(1 - c_i)
    let nonDetectionProb = 1.0;
    for (const c of individualConfidences) {
      nonDetectionProb *= 1.0 - c;
    }
    let fusedConfidence = 1.0 - nonDetectionProb;

    // Multi-sensor validation boost
    const isMultiSensor = modisCount > 0 && viirsCount > 0;
    if (isMultiSensor) {
      fusedConfidence = Math.max(fusedConfidence, 0.96); // Bump to 96%+ on dual-satellite consensus
    }

    const fusedConfidencePercent = Math.round(fusedConfidence * 100);
    const confidence: Confidence =
      fusedConfidencePercent >= 80 ? "high" : fusedConfidencePercent >= 45 ? "medium" : "low";

    const clusterId = `FUSED-${clusterIdx + 101}`;
    const rawSummary = isMultiSensor
      ? `MODIS (${modisCount}) + VIIRS (${viirsCount}) confirmed`
      : modisCount > 0
      ? `MODIS ${modisCount} pts`
      : `VIIRS ${viirsCount} pts`;

    const clusterProps: FusedFireClusterProperties = {
      cluster_id: clusterId,
      member_ids: group.map((p) => p.properties.id),
      name: representativeName,
      primary_source: isMultiSensor ? "MULTI_SENSOR" : modisCount > 0 ? "MODIS" : "VIIRS",
      sources: Array.from(new Set(group.map((p) => p.properties.source))),
      is_multi_sensor: isMultiSensor,
      detection_count: group.length,
      modis_count: modisCount,
      viirs_count: viirsCount,
      raw_confidence_summary: rawSummary,
      fused_confidence_percent: fusedConfidencePercent,
      confidence,
      max_brightness: Number(maxBrightness.toFixed(1)),
      total_frp: Number(totalFrp.toFixed(2)),
      acq_date: latestDate || new Date().toISOString().slice(0, 10),
      acq_time: latestTime || "00:00 UTC",
      settlement: closestSettlement,
      municipality: closestMunicipality,
      proximityKm: minProximityKm === Infinity ? 2.5 : minProximityKm,
      dayOffset: maxDayOffset === -Infinity ? 0 : maxDayOffset,
      center_lon: centerLon,
      center_lat: centerLat,
    };

    // 4. Geometry Generation
    // >= 3 points: convex hull polygon with 375m buffer
    if (group.length >= 3) {
      const featureGroup = turf.featureCollection(group);
      const hull = turf.convex(featureGroup);
      if (hull) {
        const buffered = turf.buffer(hull, 0.375, { units: "kilometers" }) as unknown as Feature<Polygon, FusedFireClusterProperties>;
        buffered.properties = clusterProps;
        return buffered;
      }
    }

    // Single or 2 points: circular buffer representing sensor resolution footprint
    const footprintRadiusKm = isMultiSensor ? 0.6 : modisCount > 0 ? 0.5 : 0.25;
    const circle = turf.circle([centerLon, centerLat], footprintRadiusKm, {
      units: "kilometers",
      properties: clusterProps,
    });

    return circle;
  });

  return turf.featureCollection(fusedFeatures);
}

/**
 * Harmonizes raw Hotspot array directly into deduplicated clusters.
 */
export function harmonizeHotspots(
  hotspots: Hotspot[],
  clusterRadiusKm = 1.0
): HarmonizedCluster[] {
  // Convert Hotspot[] to GeoJSON Points
  const points: RawFirePoint[] = hotspots.map((h) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [h.lng, h.lat],
    },
    properties: {
      id: h.id,
      name: h.name,
      source: h.source,
      confidence: h.rawConfidence,
      brightness: h.brightness,
      frp: h.frp,
      acq_date: h.acqDate,
      acq_time: h.acqTime,
      settlement: h.settlement,
      municipality: h.municipality,
      proximityKm: h.proximityKm,
      dayOffset: h.dayOffset,
      count: h.count,
    },
  }));

  const featureCollection = harmonizeFireGeoJson(points, clusterRadiusKm);
  const byId = new Map(hotspots.map((h) => [h.id, h]));

  return featureCollection.features.map((feat, idx) => {
    const p = feat.properties;
    return {
      id: 500 + idx,
      name: p.name,
      source: p.is_multi_sensor ? ("VIIRS" as SensorSource) : (p.primary_source as SensorSource),
      rawConfidence: p.raw_confidence_summary,
      confidence: p.confidence,
      brightness: p.max_brightness,
      acqDate: p.acq_date,
      acqTime: p.acq_time,
      lat: p.center_lat,
      lng: p.center_lon,
      settlement: p.settlement,
      municipality: p.municipality,
      proximityKm: p.proximityKm,
      dayOffset: p.dayOffset,
      count: p.detection_count,
      // Extended harmonized properties
      isMultiSensor: p.is_multi_sensor,
      sources: p.sources,
      fusedConfidencePercent: p.fused_confidence_percent,
      modisCount: p.modis_count,
      viirsCount: p.viirs_count,
      totalFrp: p.total_frp,
      frp: p.total_frp,
      detections: p.member_ids.map((id) => byId.get(id as number)!),
      geometryType: feat.geometry.type,
      geoJsonPolygon: feat.geometry,
    };
  });
}
