// Shared sample telemetry. Frontend-only: no DB, no live FIRMS feed.
// Replace these fixtures with a server query when a backend is connected.
export type SensorSource = "VIIRS" | "MODIS";
export type Confidence = "high" | "medium" | "low";

export interface Hotspot {
  id: number;
  name: string;
  source: SensorSource;
  rawConfidence: string;
  confidence: Confidence;
  brightness: number;
  acqDate: string;
  acqTime: string;
  lat: number;
  lng: number;
  settlement: string;
  municipality: string;
  proximityKm: number;
  dayOffset: number; // 0 = today, negative = days ago
  count: number;
}

export interface AlertItem {
  id: string;
  hotspotId: number;
  settlement: string;
  municipality: string;
  distanceKm: number;
  threatLevel: "CRITICAL" | "ELEVATED" | "ADVISORY";
  source: SensorSource;
  confidence: Confidence;
  brightness: number;
  timestamp: string;
  dispatched: boolean;
}

// Confidence harmonization (EMBER-main rules): MODIS numeric %, VIIRS l/n/h.
export function normalizeModis(percent: number): Confidence {
  if (percent < 30) return "low";
  if (percent < 80) return "medium";
  return "high";
}

export function normalizeViirs(flag: "l" | "n" | "h"): Confidence {
  return flag === "h" ? "high" : flag === "n" ? "medium" : "low";
}

export function threatTier(proximityKm: number): AlertItem["threatLevel"] {
  if (proximityKm < 3) return "CRITICAL";
  if (proximityKm < 6) return "ELEVATED";
  return "ADVISORY";
}

export const HOTSPOTS: Hotspot[] = [
  {
    id: 101,
    name: "Malaybalay Ridge",
    source: "VIIRS",
    rawConfidence: "h (categorical)",
    confidence: "high",
    brightness: 348.6,
    acqDate: "2026-11-13",
    acqTime: "05:22 UTC",
    lat: 8.1575,
    lng: 125.1278,
    settlement: "Sitio Silangan, Brgy. Dalwangan",
    municipality: "Malaybalay City",
    proximityKm: 1.8,
    dayOffset: 0,
    count: 18,
  },
  {
    id: 102,
    name: "Valencia Flat",
    source: "MODIS",
    rawConfidence: "89% (numeric)",
    confidence: "high",
    brightness: 334.2,
    acqDate: "2026-11-13",
    acqTime: "04:55 UTC",
    lat: 7.9043,
    lng: 125.092,
    settlement: "Agro-Forestry Corridor B",
    municipality: "Valencia City",
    proximityKm: 2.7,
    dayOffset: 0,
    count: 12,
  },
  {
    id: 103,
    name: "Maramag Grove",
    source: "VIIRS",
    rawConfidence: "n (categorical)",
    confidence: "medium",
    brightness: 316.5,
    acqDate: "2026-11-13",
    acqTime: "05:22 UTC",
    lat: 7.7583,
    lng: 125.0065,
    settlement: "Upper Pulangi Watershed",
    municipality: "Maramag",
    proximityKm: 4.6,
    dayOffset: -1,
    count: 9,
  },
  {
    id: 104,
    name: "Manolo Highlands",
    source: "MODIS",
    rawConfidence: "62% (numeric)",
    confidence: "medium",
    brightness: 308.1,
    acqDate: "2026-11-12",
    acqTime: "14:10 UTC",
    lat: 8.3677,
    lng: 124.8665,
    settlement: "Ridge Crest Plantation",
    municipality: "Manolo Fortich",
    proximityKm: 6.9,
    dayOffset: -2,
    count: 7,
  },
  {
    id: 105,
    name: "Quezon Valley",
    source: "VIIRS",
    rawConfidence: "l (categorical)",
    confidence: "low",
    brightness: 297.4,
    acqDate: "2026-11-12",
    acqTime: "18:30 UTC",
    lat: 7.7306,
    lng: 125.104,
    settlement: "North Perimeter Buffer",
    municipality: "Quezon",
    proximityKm: 11.2,
    dayOffset: -3,
    count: 5,
  },
  {
    id: 106,
    name: "Impasugong Pine",
    source: "VIIRS",
    rawConfidence: "h (categorical)",
    confidence: "high",
    brightness: 352.0,
    acqDate: "2026-11-12",
    acqTime: "06:15 UTC",
    lat: 8.3011,
    lng: 125.0061,
    settlement: "Poblacion Upland",
    municipality: "Impasugong",
    proximityKm: 2.3,
    dayOffset: -4,
    count: 11,
  },
  {
    id: 107,
    name: "Kitaotao Ridge",
    source: "MODIS",
    rawConfidence: "45% (numeric)",
    confidence: "medium",
    brightness: 310.8,
    acqDate: "2026-11-11",
    acqTime: "13:40 UTC",
    lat: 7.6518,
    lng: 125.0118,
    settlement: "Arau Creek Zone",
    municipality: "Kitaotao",
    proximityKm: 8.5,
    dayOffset: -5,
    count: 6,
  },
  {
    id: 108,
    name: "Don Carlos Flat",
    source: "VIIRS",
    rawConfidence: "n (categorical)",
    confidence: "medium",
    brightness: 320.6,
    acqDate: "2026-11-10",
    acqTime: "09:05 UTC",
    lat: 7.7208,
    lng: 124.9989,
    settlement: "South Agri Belt",
    municipality: "Don Carlos",
    proximityKm: 7.4,
    dayOffset: -6,
    count: 4,
  },
];

export const ALERTS: AlertItem[] = [
  {
    id: "ALT-2026-001",
    hotspotId: 101,
    settlement: "Sitio Silangan, Brgy. Dalwangan",
    municipality: "Malaybalay City",
    distanceKm: 1.8,
    threatLevel: "CRITICAL",
    source: "VIIRS",
    confidence: "high",
    brightness: 348.6,
    timestamp: "12 mins ago",
    dispatched: false,
  },
  {
    id: "ALT-2026-002",
    hotspotId: 102,
    settlement: "Agro-Forestry Corridor B",
    municipality: "Valencia City",
    distanceKm: 2.7,
    threatLevel: "CRITICAL",
    source: "MODIS",
    confidence: "high",
    brightness: 334.2,
    timestamp: "38 mins ago",
    dispatched: true,
  },
  {
    id: "ALT-2026-003",
    hotspotId: 103,
    settlement: "Upper Pulangi Watershed",
    municipality: "Maramag",
    distanceKm: 4.6,
    threatLevel: "ELEVATED",
    source: "VIIRS",
    confidence: "medium",
    brightness: 316.5,
    timestamp: "1 hr ago",
    dispatched: false,
  },
  {
    id: "ALT-2026-004",
    hotspotId: 104,
    settlement: "Ridge Crest Plantation",
    municipality: "Manolo Fortich",
    distanceKm: 6.9,
    threatLevel: "ADVISORY",
    source: "MODIS",
    confidence: "medium",
    brightness: 308.1,
    timestamp: "2 hrs ago",
    dispatched: false,
  },
];

export const DAILY_TREND = [
  { day: "Mon", viirs: 42, modis: 18 },
  { day: "Tue", viirs: 56, modis: 24 },
  { day: "Wed", viirs: 78, modis: 31 },
  { day: "Thu", viirs: 64, modis: 29 },
  { day: "Fri", viirs: 92, modis: 38 },
  { day: "Sat", viirs: 110, modis: 45 },
  { day: "Sun", viirs: 84, modis: 36 },
];

export const MUNICIPALITIES = [
  { name: "Malaybalay City", activeFires: 8, highestBrightness: "348.6 K", risk: "CRITICAL" },
  { name: "Valencia City", activeFires: 5, highestBrightness: "334.2 K", risk: "CRITICAL" },
  { name: "Maramag", activeFires: 4, highestBrightness: "316.5 K", risk: "ELEVATED" },
  { name: "Manolo Fortich", activeFires: 3, highestBrightness: "308.1 K", risk: "ELEVATED" },
  { name: "Quezon", activeFires: 1, highestBrightness: "297.4 K", risk: "ADVISORY" },
] as const;

export const SATELLITES = [
  {
    name: "Suomi-NPP (VIIRS)",
    sensor: "VIIRS I-Band",
    resolution: "375 m",
    status: "HEALTHY",
    lastSync: "14 mins ago",
    nextPass: "in 48 mins",
  },
  {
    name: "NOAA-20 (VIIRS)",
    sensor: "VIIRS I-Band",
    resolution: "375 m",
    status: "HEALTHY",
    lastSync: "32 mins ago",
    nextPass: "in 1 hr 20 mins",
  },
  {
    name: "Terra (EOS AM-1)",
    sensor: "MODIS",
    resolution: "1 km",
    status: "HEALTHY",
    lastSync: "45 mins ago",
    nextPass: "in 3 hrs 10 mins",
  },
  {
    name: "Aqua (EOS PM-1)",
    sensor: "MODIS",
    resolution: "1 km",
    status: "HEALTHY",
    lastSync: "1 hr ago",
    nextPass: "in 4 hrs 45 mins",
  },
];

export const SYNC_LOGS = [
  "[05:22:10 UTC] [FIRMS_CLIENT] Ingesting NASA VIIRS NOAA-20 payload (142 raw detections)...",
  "[05:22:11 UTC] [HARMONIZER] Normalizing confidence flags: 'h' -> high, 'n' -> medium, 'l' -> low.",
  "[05:22:11 UTC] [COORDINATE_TRANSFORM] Converting coordinates: Latitude, Longitude -> ST_SetSRID(ST_MakePoint(lon, lat), 4326).",
  "[05:22:12 UTC] [SPATIAL_CLUSTER] Running proximity deduplication across MODIS/VIIRS overlap window...",
  "[05:22:12 UTC] [DEDUPLICATION] Consolidated 18 duplicate detections within 500m radius.",
  "[05:22:13 UTC] [POSTGIS_UPSERT] Upserting 124 records into table 'wildfire_hotspots' (GIST index verified).",
  "[05:22:13 UTC] [PROXIMITY_TRIGGER] Executing ST_DWithin settlement distance query: 2 critical alerts identified.",
  "[05:22:14 UTC] [SYNC_COMPLETE] Batch sync completed successfully in 3.42s.",
];

