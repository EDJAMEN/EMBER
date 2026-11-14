import {
  type Confidence,
  type Hotspot,
  type SensorSource,
  haversineKm,
  normalizeModis,
  normalizeViirs,
} from "./hotspots";

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export const ARCHIVE_TOWNS = [
  { name: "Malaybalay Ridge", settlement: "Sitio Silangan, Brgy. Dalwangan", municipality: "Malaybalay City", lat: 8.1575, lng: 125.1278, proximityKm: 1.8 },
  { name: "Valencia Flat", settlement: "Agro-Forestry Corridor B", municipality: "Valencia City", lat: 7.9043, lng: 125.092, proximityKm: 2.7 },
  { name: "Quezon Valley", settlement: "North Perimeter Buffer", municipality: "Quezon", lat: 7.7306, lng: 125.104, proximityKm: 3.4 },
  { name: "Manolo Highlands", settlement: "Ridge Crest Plantation", municipality: "Manolo Fortich", lat: 8.3677, lng: 124.8665, proximityKm: 4.9 },
  { name: "Don Carlos Flat", settlement: "South Agri Belt", municipality: "Don Carlos", lat: 7.7208, lng: 124.9989, proximityKm: 4.1 },
  { name: "Maramag Grove", settlement: "Upper Pulangi Watershed", municipality: "Maramag", lat: 7.7583, lng: 125.0065, proximityKm: 4.6 },
  { name: "Impasugong Pine", settlement: "Poblacion Upland", municipality: "Impasugong", lat: 8.3011, lng: 125.0061, proximityKm: 2.3 },
] as const;

const REGIONAL_ANCHORS = [
  { name: "Bukidnon Highlands", settlement: "Central Kitanglad Buffer", municipality: "Malaybalay City", lat: 8.11, lng: 125.04, proximityKm: 5.2 },
  { name: "Cotabato Marsh Belt", settlement: "Ligawasan Basin Sector", municipality: "Cotabato", lat: 7.05, lng: 124.62, proximityKm: 6.8 },
  { name: "Davao Upland Ridge", settlement: "Marilog Agro Buffer", municipality: "Davao City", lat: 7.38, lng: 125.31, proximityKm: 7.4 },
  { name: "Agusan Peat Corridor", settlement: "Upper Agusan Valley", municipality: "Bunawan", lat: 8.19, lng: 125.98, proximityKm: 6.1 },
] as const;

const OVERPASS_SLOTS = [
  { time: "02:25 UTC", sensorBias: "MODIS" as SensorSource },
  { time: "05:18 UTC", sensorBias: "VIIRS" as SensorSource },
  { time: "13:55 UTC", sensorBias: "MODIS" as SensorSource },
  { time: "17:42 UTC", sensorBias: "VIIRS" as SensorSource },
] as const;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function compassDir(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(rad(toLng - fromLng)) * Math.cos(rad(toLat));
  const x =
    Math.cos(rad(fromLat)) * Math.sin(rad(toLat)) -
    Math.sin(rad(fromLat)) * Math.cos(rad(toLat)) * Math.cos(rad(toLng - fromLng));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8]!;
}

export function addDaysIso(isoDate: string, deltaDays: number): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(ms)) return isoDate;
  return new Date(ms + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

export function diffDaysIso(aIso: string, bIso: string): number {
  const aMs = Date.parse(`${aIso}T00:00:00Z`);
  const bMs = Date.parse(`${bIso}T00:00:00Z`);
  if (!Number.isFinite(aMs) || !Number.isFinite(bMs)) return 0;
  return Math.round((aMs - bMs) / 86_400_000);
}

export function formatShortDate(isoDate: string): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(ms)) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

function nearestTown(lat: number, lng: number, ref?: { lat: number; lng: number; name: string } | null) {
  if (ref) {
    const km = Math.round(haversineKm(ref.lat, ref.lng, lat, lng) * 10) / 10;
    const where = km < 1 ? `At ${ref.name}` : `${Math.round(km)} km ${compassDir(ref.lat, ref.lng, lat, lng)} of ${ref.name}`;
    return { name: where, settlement: where, municipality: ref.name, proximityKm: km };
  }
  let best: (typeof ARCHIVE_TOWNS)[number] = ARCHIVE_TOWNS[0];
  let bestKm = haversineKm(lat, lng, best.lat, best.lng);
  for (const town of ARCHIVE_TOWNS.slice(1)) {
    const d = haversineKm(lat, lng, town.lat, town.lng);
    if (d < bestKm) {
      bestKm = d;
      best = town;
    }
  }
  const inBukidnonRange = bestKm <= 100;
  return {
    name: inBukidnonRange ? `${best.municipality} Archive` : `Sector ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`,
    settlement: inBukidnonRange ? `Near ${best.settlement}, ${best.municipality}` : `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E`,
    municipality: inBukidnonRange ? best.municipality : "Regional",
    proximityKm: Math.round(bestKm * 10) / 10,
  };
}

/**
 * Generates deterministic, climatology-weighted historical archive detections across
 * Bukidnon & Mindanao (or any custom bbox) for 2000-11-01 to present when offline or
 * inspecting >10-day archive ranges. Enforces MODIS-only (<2012) vs MODIS+VIIRS (>=2012).
 */
export function generateHistoricalArchiveHotspots(params: {
  startDate: string;
  days: number;
  bbox: [number, number, number, number];
  sensor?: "BOTH" | "VIIRS" | "MODIS";
  ref?: { lat: number; lng: number; name: string } | null;
}): Hotspot[] {
  const { startDate, days, bbox, sensor = "BOTH", ref = null } = params;
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const clampedDays = Math.max(1, Math.min(31, days));
  const out: Hotspot[] = [];
  let seqId = 30000;

  // Match custom remote bbox if outside Northern/Central Mindanao
  const overlapsMindanao = maxLat >= 5.2 && minLat <= 9.8 && maxLon >= 122.0 && minLon <= 127.0;

  for (let offset = 0; offset < clampedDays; offset++) {
    const acqDate = addDaysIso(startDate, offset);
    const year = Number(acqDate.slice(0, 4));
    const modisEraOnly = year < 2012;
    const effectiveSensor = modisEraOnly ? "MODIS" : sensor;
    if (modisEraOnly && sensor === "VIIRS") continue;

    const ms = Date.parse(`${acqDate}T00:00:00Z`);
    const doy = (ms - Date.UTC(year, 0, 1)) / 86_400_000;
    // Dry season Mar-May peak + secondary Aug-Sep peak
    const seasonalIntensity =
      0.55 +
      1.15 * Math.exp(-((doy - 95) ** 2) / (2 * 38 ** 2)) +
      0.45 * Math.exp(-((doy - 235) ** 2) / (2 * 24 ** 2));

    const rand = mulberry32(hashSeed(`${acqDate}|${minLat.toFixed(1)},${minLon.toFixed(1)}`));

    if (overlapsMindanao) {
      const pool = [...ARCHIVE_TOWNS, ...REGIONAL_ANCHORS].filter(
        (t) =>
          t.lat >= minLat - 0.35 &&
          t.lat <= maxLat + 0.35 &&
          t.lng >= minLon - 0.35 &&
          t.lng <= maxLon + 0.35,
      );
      const activeAnchors = pool.length > 0 ? pool : ARCHIVE_TOWNS.slice(0, 5);
      const countToday = Math.min(
        activeAnchors.length,
        Math.max(2, Math.round((2.2 + rand() * 3.1) * Math.min(1.6, seasonalIntensity))),
      );

      for (let i = 0; i < countToday; i++) {
        const anchor = activeAnchors[(i + Math.floor(rand() * activeAnchors.length)) % activeAnchors.length]!;
        const slot = OVERPASS_SLOTS[(i + offset) % OVERPASS_SLOTS.length]!;
        const chosenSource: SensorSource =
          effectiveSensor === "MODIS"
            ? "MODIS"
            : effectiveSensor === "VIIRS"
              ? "VIIRS"
              : modisEraOnly
                ? "MODIS"
                : slot.sensorBias;

        const dLat = (rand() - 0.5) * 0.045;
        const dLng = (rand() - 0.5) * 0.045;
        const lat = Math.round((anchor.lat + dLat) * 10000) / 10000;
        const lng = Math.round((anchor.lng + dLng) * 10000) / 10000;

        // Raw calibration difference: VIIRS 375m resolves hotter sub-pixel peaks than MODIS 1km,
        // while 2000-2011 MODIS records include harmonized scale uplift in FRP.
        const rawModisConf = Math.round(48 + rand() * 48);
        const viirsFlag: "l" | "n" | "h" = rand() > 0.42 ? "h" : rand() > 0.15 ? "n" : "l";
        const confidence: Confidence =
          chosenSource === "MODIS" ? normalizeModis(rawModisConf) : normalizeViirs(viirsFlag);
        const rawConfidence =
          chosenSource === "MODIS"
            ? `${rawModisConf}% (numeric${modisEraOnly ? " · MODIS 1km harmonized" : ""})`
            : `${viirsFlag} (categorical)`;

        const baseBrightness = chosenSource === "VIIRS" ? 326 + rand() * 36 : 316 + rand() * 28;
        const brightness = Math.round((baseBrightness + (confidence === "high" ? 12 : 0)) * 10) / 10;
        const frp =
          Math.round((14 + rand() * 88 * seasonalIntensity * (modisEraOnly ? 1.18 : 1)) * 10) / 10;

        const refInfo = ref
          ? nearestTown(lat, lng, ref)
          : {
              name: anchor.name,
              settlement: anchor.settlement,
              municipality: anchor.municipality,
              proximityKm: anchor.proximityKm,
            };

        const sources: SensorSource[] =
          !modisEraOnly && effectiveSensor === "BOTH" && i === 0 ? ["VIIRS", "MODIS"] : [chosenSource];

        out.push({
          id: seqId++,
          name: refInfo.name,
          source: chosenSource,
          sources,
          rawConfidence,
          confidence,
          brightness,
          frp,
          acqDate,
          acqTime: slot.time,
          lat,
          lng,
          settlement: refInfo.settlement,
          municipality: refInfo.municipality,
          proximityKm: refInfo.proximityKm,
          dayOffset: -(clampedDays - 1 - offset),
          count: Math.max(1, Math.round(1 + rand() * (sources.length > 1 ? 8 : 4))),
        });
      }
    } else {
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLon + maxLon) / 2;
      const spanLat = Math.max(0.15, Math.min(2.5, maxLat - minLat));
      const spanLng = Math.max(0.15, Math.min(2.5, maxLon - minLon));
      const countToday = Math.max(1, Math.round(1 + rand() * 3));

      for (let i = 0; i < countToday; i++) {
        const slot = OVERPASS_SLOTS[(i + offset) % OVERPASS_SLOTS.length]!;
        const chosenSource: SensorSource =
          effectiveSensor === "MODIS" || modisEraOnly
            ? "MODIS"
            : effectiveSensor === "VIIRS"
              ? "VIIRS"
              : slot.sensorBias;
        const lat = Math.round((centerLat + (rand() - 0.5) * spanLat * 0.55) * 10000) / 10000;
        const lng = Math.round((centerLng + (rand() - 0.5) * spanLng * 0.55) * 10000) / 10000;
        const rawModisConf = Math.round(52 + rand() * 44);
        const viirsFlag: "l" | "n" | "h" = rand() > 0.35 ? "h" : "n";
        const confidence: Confidence =
          chosenSource === "MODIS" ? normalizeModis(rawModisConf) : normalizeViirs(viirsFlag);
        const info = nearestTown(lat, lng, ref);

        out.push({
          id: seqId++,
          name: info.name,
          source: chosenSource,
          sources: !modisEraOnly && effectiveSensor === "BOTH" && i === 0 ? ["VIIRS", "MODIS"] : [chosenSource],
          rawConfidence:
            chosenSource === "MODIS" ? `${rawModisConf}% (numeric)` : `${viirsFlag} (categorical)`,
          confidence,
          brightness: Math.round((318 + rand() * 34) * 10) / 10,
          frp: Math.round((18 + rand() * 72) * 10) / 10,
          acqDate,
          acqTime: slot.time,
          lat,
          lng,
          settlement: info.settlement,
          municipality: info.municipality,
          proximityKm: info.proximityKm,
          dayOffset: -(clampedDays - 1 - offset),
          count: Math.max(1, Math.round(1 + rand() * 3)),
        });
      }
    }
  }

  return out;
}

/** Parses NASA FIRMS Area CSV rows (`latitude,longitude,bright_ti4|brightness,...,acq_date,acq_time,...,confidence,frp`) into `Hotspot[]`. */
export function parseFirmsAreaCsv(
  csvText: string,
  source: SensorSource,
  anchorEndDate: string,
  ref?: { lat: number; lng: number; name: string } | null,
): Hotspot[] {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);

  const iLat = col("latitude");
  const iLon = col("longitude");
  const iDate = col("acq_date");
  const iTime = col("acq_time");
  const iConf = col("confidence");
  const iFrp = col("frp");
  const iBright =
    col("bright_ti4") >= 0 ? col("bright_ti4") : col("brightness") >= 0 ? col("brightness") : col("bright_ti5");

  if (iLat < 0 || iLon < 0 || iDate < 0) return [];

  const out: Hotspot[] = [];
  for (let r = 1; r < lines.length; r++) {
    const rawLine = lines[r]?.trim();
    if (!rawLine) continue;
    const cols = rawLine.split(",");
    const lat = Number.parseFloat(cols[iLat] ?? "");
    const lng = Number.parseFloat(cols[iLon] ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const acqDate = (cols[iDate] ?? "").trim().slice(0, 10);
    const digits = (cols[iTime] ?? "").replace(/\D/g, "").padStart(4, "0");
    const acqTime = `${digits.slice(0, 2)}:${digits.slice(2, 4)} UTC`;

    const rawConfStr = (cols[iConf] ?? "").trim().toLowerCase();
    let confidence: Confidence;
    let rawConfidence: string;
    if (source === "VIIRS") {
      const flag: "l" | "n" | "h" = rawConfStr.startsWith("h")
        ? "h"
        : rawConfStr.startsWith("n")
          ? "n"
          : "l";
      confidence = normalizeViirs(flag);
      rawConfidence = `${rawConfStr || flag} (categorical)`;
    } else {
      const num = Number.parseFloat(rawConfStr);
      confidence = normalizeModis(Number.isFinite(num) ? num : 50);
      rawConfidence = `${Number.isFinite(num) ? `${num}%` : rawConfStr || "unknown"} (numeric)`;
    }

    const brightVal = Number.parseFloat(cols[iBright] ?? "");
    const brightness = Number.isFinite(brightVal) ? Math.round(brightVal * 10) / 10 : 310;
    const frpVal = iFrp >= 0 ? Number.parseFloat(cols[iFrp] ?? "") : NaN;
    const frp = Number.isFinite(frpVal) ? Math.round(frpVal * 10) / 10 : undefined;

    const info = nearestTown(lat, lng, ref);
    const diff = diffDaysIso(acqDate, anchorEndDate);
    out.push({
      id: 40000 + out.length,
      name: info.name,
      source,
      rawConfidence,
      confidence,
      brightness,
      frp,
      acqDate,
      acqTime,
      lat,
      lng,
      settlement: info.settlement,
      municipality: info.municipality,
      proximityKm: info.proximityKm,
      dayOffset: Math.min(0, diff),
      count: 1,
    });
  }

  return out;
}
