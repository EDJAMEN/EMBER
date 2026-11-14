import { NextRequest, NextResponse } from "next/server";
import {
  type Confidence,
  type Hotspot,
  type SensorSource,
  normalizeModis,
  normalizeViirs,
} from "@/lib/hotspots";
import {
  addDaysIso,
  diffDaysIso,
  generateHistoricalArchiveHotspots,
  parseFirmsAreaCsv,
} from "@/lib/historical-fires";

const DEFAULT_BBOX: [number, number, number, number] = [7.3, 124.5, 8.6, 125.5];
const CACHE_TTL_MS = 2 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

const TOWNS = [
  { settlement: "Poblacion", municipality: "Malaybalay City", lat: 8.1575, lng: 125.1278 },
  { settlement: "Poblacion", municipality: "Valencia City", lat: 7.9043, lng: 125.092 },
  { settlement: "Poblacion", municipality: "Maramag", lat: 7.7583, lng: 125.0065 },
  { settlement: "Poblacion", municipality: "Manolo Fortich", lat: 8.3677, lng: 124.8665 },
  { settlement: "Poblacion", municipality: "Quezon", lat: 7.7306, lng: 125.104 },
  { settlement: "Poblacion", municipality: "Impasugong", lat: 8.3011, lng: 125.0061 },
  { settlement: "Poblacion", municipality: "Don Carlos", lat: 7.7208, lng: 124.9989 },
];

interface WfsFeature {
  type?: string;
  id?: string | number;
  geometry?: {
    type?: string;
    coordinates?: [number, number];
  } | null;
  properties?: Record<string, unknown> | null;
}

interface WfsResponse {
  type?: string;
  features?: WfsFeature[];
}

export interface FirmsHotspotsPayload {
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

const responseCache = new Map<string, { payload: FirmsHotspotsPayload; expiresAt: number }>();

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
function compass(fromLat: number, fromLng: number, toLat: number, toLng: number) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(rad(toLng - fromLng)) * Math.cos(rad(toLat));
  const x =
    Math.cos(rad(fromLat)) * Math.sin(rad(toLat)) -
    Math.sin(rad(fromLat)) * Math.cos(rad(toLat)) * Math.cos(rad(toLng - fromLng));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8]!;
}

type Ref = { lat: number; lng: number; name: string };

function parseBbox(raw: string | null): [number, number, number, number] {
  if (!raw) return DEFAULT_BBOX;
  const parts = raw.split(",").map((v) => Number.parseFloat(v.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return DEFAULT_BBOX;
  }
  const [rawMinLat, rawMinLon, rawMaxLat, rawMaxLon] = parts as [number, number, number, number];
  let minLat = Math.max(-85, Math.min(85, rawMinLat));
  let maxLat = Math.max(-85, Math.min(85, rawMaxLat));
  if (minLat > maxLat) [minLat, maxLat] = [maxLat, minLat];
  let minLon = Math.max(-180, Math.min(180, rawMinLon));
  let maxLon = Math.max(-180, Math.min(180, rawMaxLon));
  if (minLon > maxLon) [minLon, maxLon] = [maxLon, minLon];
  if (maxLon - minLon < 0.01) {
    minLon = Math.max(-180, minLon - 0.1);
    maxLon = Math.min(180, maxLon + 0.1);
  }
  return [minLat, minLon, maxLat, maxLon];
}

function detectRegion(bbox: [number, number, number, number]): "SouthEast_Asia" | "Global" {
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const inSea = minLat >= -11 && maxLat <= 28 && minLon >= 92 && maxLon <= 141;
  return inSea ? "SouthEast_Asia" : "Global";
}

function computeDayOffset(acqDate: string): number {
  if (!acqDate) return 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMs = Date.parse(`${todayStr}T00:00:00Z`);
  const acqMs = Date.parse(`${acqDate}T00:00:00Z`);
  if (!Number.isFinite(todayMs) || !Number.isFinite(acqMs)) return 0;
  const diff = Math.round((acqMs - todayMs) / 86_400_000);
  return Math.max(-6, Math.min(0, diff));
}

function formatAcqTime(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "").padStart(4, "0");
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)} UTC`;
}

function normalizeConfidence(raw: unknown, source: SensorSource): { confidence: Confidence; rawLabel: string } {
  const str = String(raw ?? "").trim().toLowerCase();
  if (source === "VIIRS") {
    const flag: "l" | "n" | "h" = str.startsWith("h") ? "h" : str.startsWith("n") ? "n" : "l";
    return {
      confidence: normalizeViirs(flag),
      rawLabel: `${str || flag} (categorical)`,
    };
  }
  const num = Number.parseFloat(str);
  return {
    confidence: normalizeModis(Number.isFinite(num) ? num : 50),
    rawLabel: `${Number.isFinite(num) ? `${num}%` : str || "unknown"} (numeric)`,
  };
}

async function fetchWfsLayer(
  key: string,
  region: "SouthEast_Asia" | "Global",
  typename: string,
  source: SensorSource,
  bbox: [number, number, number, number],
  ref: Ref | null,
): Promise<Hotspot[]> {
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const bboxParam = `${minLat},${minLon},${maxLat},${maxLon},urn:ogc:def:crs:EPSG::4326`;
  const params = new URLSearchParams({
    SERVICE: "WFS",
    VERSION: "2.0.0",
    REQUEST: "GetFeature",
    TYPENAME: typename,
    SRSNAME: "urn:ogc:def:crs:EPSG::4326",
    BBOX: bboxParam,
    OUTPUTFORMAT: "application/json",
  });

  const url = `https://firms.modaps.eosdis.nasa.gov/mapserver/wfs/${region}/${encodeURIComponent(key)}/?${params.toString()}`;
  // A slow layer (NOAA-20 often is) must not hold up the others.
  const res = await fetch(url, { next: { revalidate: 120 }, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) {
    throw new Error(`FIRMS WFS ${typename} responded ${res.status}`);
  }

  const rawText = await res.text();
  if (!rawText.trimStart().startsWith("{")) {
    throw new Error(`FIRMS WFS ${typename} rejected: ${rawText.trim().slice(0, 60) || "non-JSON"}`);
  }

  const json = JSON.parse(rawText) as WfsResponse;
  const features = Array.isArray(json.features) ? json.features : [];
  const out: Hotspot[] = [];

  features.forEach((feature, idx) => {
    const props = feature.properties ?? {};
    const coords = feature.geometry?.coordinates;
    const lat = Number(props["latitude"] ?? (Array.isArray(coords) ? coords[1] : NaN));
    const lng = Number(props["longitude"] ?? (Array.isArray(coords) ? coords[0] : NaN));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const acqDate = String(props["acq_date"] ?? "").slice(0, 10);
    const acqTime = formatAcqTime(props["acq_time"]);
    const { confidence, rawLabel } = normalizeConfidence(props["confidence"], source);
    const brightnessRaw = Number.parseFloat(
      String(props["bright_ti4"] ?? props["brightness"] ?? props["bright_ti5"] ?? ""),
    );
    const brightness = Number.isFinite(brightnessRaw) ? Math.round(brightnessRaw * 10) / 10 : 300;
    const frpRaw = Number.parseFloat(String(props["frp"] ?? ""));
    const frp = Number.isFinite(frpRaw) ? frpRaw : undefined;

    if (ref) {
      // Measured from the searched place itself, e.g. "12 km NE of Valencia City".
      const km = Math.round(haversineKm(ref.lat, ref.lng, lat, lng) * 10) / 10;
      const where = km < 1 ? `At ${ref.name}` : `${Math.round(km)} km ${compass(ref.lat, ref.lng, lat, lng)} of ${ref.name}`;
      out.push({
        id: 10000 + idx, name: where, source, rawConfidence: rawLabel, confidence, brightness, frp,
        acqDate, acqTime, lat, lng, settlement: where, municipality: ref.name, proximityKm: km,
        dayOffset: computeDayOffset(acqDate), count: 1,
      });
      return;
    }

    let nearest = TOWNS[0]!;
    let proximityKm = haversineKm(lat, lng, nearest.lat, nearest.lng);
    for (const town of TOWNS.slice(1)) {
      const d = haversineKm(lat, lng, town.lat, town.lng);
      if (d < proximityKm) {
        proximityKm = d;
        nearest = town;
      }
    }

    const inBukidnonRange = proximityKm <= 100;
    const municipality = inBukidnonRange ? nearest.municipality : "Regional";
    const settlement = inBukidnonRange
      ? `Near ${nearest.settlement}, ${nearest.municipality}`
      : `${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E`;
    const name = inBukidnonRange
      ? `${nearest.municipality} ${source}`
      : `Sector ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`;

    out.push({
      id: 10000 + idx,
      name,
      source,
      rawConfidence: rawLabel,
      confidence,
      brightness,
      frp,
      acqDate,
      acqTime,
      lat,
      lng,
      settlement,
      municipality,
      proximityKm: Math.round(proximityKm * 10) / 10,
      dayOffset: computeDayOffset(acqDate),
      count: 1,
    });
  });

  return out;
}

async function fetchAreaCsvSource(params: {
  key: string;
  firmsSource: string;
  sensor: SensorSource;
  bbox: [number, number, number, number];
  startDate: string;
  days: number;
  endDate: string;
  ref: Ref | null;
}): Promise<Hotspot[]> {
  const { key, firmsSource, sensor, bbox, startDate, days, endDate, ref } = params;
  const [minLat, minLon, maxLat, maxLon] = bbox;
  const areaBbox = `${minLon.toFixed(4)},${minLat.toFixed(4)},${maxLon.toFixed(4)},${maxLat.toFixed(4)}`;
  const clampedChunk = Math.max(1, Math.min(5, days));
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(key)}/${firmsSource}/${areaBbox}/${clampedChunk}/${startDate}`;
  const res = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) {
    throw new Error(`FIRMS Area ${firmsSource} responded ${res.status}`);
  }
  const text = await res.text();
  if (!text || text.toLowerCase().includes("invalid") || text.toLowerCase().includes("exceed")) {
    return [];
  }
  return parseFirmsAreaCsv(text, sensor, endDate, ref);
}

function dedupeHotspots(items: Hotspot[], maxItems = 4000): Hotspot[] {
  const seen = new Set<string>();
  const deduped: Hotspot[] = [];
  const sorted = [...items].sort((a, b) => b.brightness - a.brightness);
  for (const item of sorted) {
    const dk = `${item.source}|${item.lat.toFixed(4)}|${item.lng.toFixed(4)}|${item.acqDate}|${item.acqTime}`;
    if (seen.has(dk)) continue;
    seen.add(dk);
    deduped.push({ ...item, id: 10000 + deduped.length });
    if (deduped.length >= maxItems) break;
  }
  return deduped;
}

async function fetchNrtAreaRange(params: {
  key: string;
  bbox: [number, number, number, number];
  startDate: string;
  days: number;
  endDate: string;
  sensorFilter: "BOTH" | "VIIRS" | "MODIS";
  ref: Ref | null;
}): Promise<{ rows: Hotspot[]; succeeded: number; errors: string[] }> {
  const { key, bbox, startDate, days, endDate, sensorFilter, ref } = params;
  const dLat = Math.abs(bbox[2] - bbox[0]);
  const dLon = Math.abs(bbox[3] - bbox[1]);
  const wideView = dLat > 45 || dLon > 75;

  const sourcesToQuery: Array<{ firmsSource: string; sensor: SensorSource }> = [];
  if (sensorFilter !== "VIIRS") sourcesToQuery.push({ firmsSource: "MODIS_NRT", sensor: "MODIS" });
  if (sensorFilter !== "MODIS") {
    sourcesToQuery.push({ firmsSource: "VIIRS_NOAA21_NRT", sensor: "VIIRS" });
    if (!wideView) sourcesToQuery.push({ firmsSource: "VIIRS_NOAA20_NRT", sensor: "VIIRS" });
  }

  const effectiveDays = wideView ? (days <= 2 ? days : 5) : Math.min(days, 10);
  const effectiveStart =
    wideView && effectiveDays < days ? addDaysIso(endDate, -(effectiveDays - 1)) : startDate;

  const chunks: Array<{ date: string; span: number }> = [];
  for (let offset = 0; offset < effectiveDays; offset += 5) {
    chunks.push({
      date: addDaysIso(effectiveStart, offset),
      span: Math.min(5, effectiveDays - offset),
    });
  }

  const settled = await Promise.allSettled(
    chunks.flatMap((chunk) =>
      sourcesToQuery.map((src) =>
        fetchAreaCsvSource({
          key,
          firmsSource: src.firmsSource,
          sensor: src.sensor,
          bbox,
          startDate: chunk.date,
          days: chunk.span,
          endDate,
          ref,
        }),
      ),
    ),
  );

  const rows: Hotspot[] = [];
  const errors: string[] = [];
  let succeeded = 0;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      succeeded += 1;
      rows.push(...r.value);
    } else {
      errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }
  return {
    rows: dedupeHotspots(rows, wideView ? 1800 : 4000),
    succeeded,
    errors,
  };
}

export async function GET(request: NextRequest) {
  const key = process.env.FIRMS_MAP_KEY?.trim() || process.env.NASA_FIRMS_MAP_KEY?.trim();
  const { searchParams } = request.nextUrl;
  const bbox = parseBbox(searchParams.get("bbox"));
  const windowParam = searchParams.get("window") === "7d" ? "7d" : "24h";
  const dateParamRaw = searchParams.get("date")?.trim();
  const daysRaw = Number.parseInt(searchParams.get("days") ?? "", 10);
  const sensorParamRaw = (searchParams.get("sensor") ?? "BOTH").toUpperCase();
  const sensorFilter: "BOTH" | "VIIRS" | "MODIS" =
    sensorParamRaw === "VIIRS" || sensorParamRaw === "MODIS" ? sensorParamRaw : "BOTH";

  const todayStr = new Date().toISOString().slice(0, 10);
  const hasValidDate = Boolean(dateParamRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateParamRaw));
  const clampedDate = hasValidDate
    ? dateParamRaw! < "2000-11-01"
      ? "2000-11-01"
      : dateParamRaw! > todayStr
        ? todayStr
        : dateParamRaw!
    : null;
  const requestedDays = Number.isFinite(daysRaw)
    ? Math.max(1, Math.min(31, daysRaw))
    : windowParam === "7d"
      ? 7
      : 1;

  const regionParam = searchParams.get("region");
  const region: "SouthEast_Asia" | "Global" =
    regionParam === "Global" || regionParam === "SouthEast_Asia"
      ? regionParam
      : detectRegion(bbox);

  const refLat = Number(searchParams.get("lat"));
  const refLng = Number(searchParams.get("lng"));
  const ref: Ref | null =
    searchParams.has("lat") && Number.isFinite(refLat) && Number.isFinite(refLng) && Math.abs(refLat) <= 90 && Math.abs(refLng) <= 180
      ? { lat: refLat, lng: refLng, name: (searchParams.get("name") ?? "").slice(0, 80) || "selected place" }
      : null;

  const roundedBboxKey = bbox.map((n) => n.toFixed(2)).join(",");
  const cacheKey = `${region}|${windowParam}|${clampedDate ?? "live"}|${requestedDays}|${sensorFilter}|${roundedBboxKey}|${ref ? `${ref.lat.toFixed(3)},${ref.lng.toFixed(3)},${ref.name}` : ""}`;
  const now = Date.now();
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload, {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
        "X-Cache": "HIT",
      },
    });
  }

  // Date-parameterized request: support <10d live/NRT Area API and >10d historical archive (2000-present)
  if (clampedDate) {
    const ageDays = Math.max(0, diffDaysIso(todayStr, clampedDate));
    const endDate = (() => {
      const raw = addDaysIso(clampedDate, requestedDays - 1);
      return raw > todayStr ? todayStr : raw;
    })();
    const startYear = Number(clampedDate.slice(0, 4));
    const modisEraOnly = startYear < 2012;
    const eraNote = modisEraOnly
      ? "MODIS Era Only (1km) · Harmonized to VIIRS-equivalent scale"
      : null;

    if (!modisEraOnly && ageDays <= 10 && key) {
      const { rows: deduped, succeeded } = await fetchNrtAreaRange({
        key,
        bbox,
        startDate: clampedDate,
        days: requestedDays,
        endDate,
        sensorFilter,
        ref,
      });
      if (succeeded > 0) {
        const payload: FirmsHotspotsPayload = {
          data: deduped,
          region,
          window: requestedDays > 1 ? "7d" : "24h",
          fetchedAt: new Date().toISOString(),
          rawCount: deduped.length,
          startDate: clampedDate,
          endDate,
          historical: ageDays > 0,
          dataSource: "firms-area",
          eraNote,
        };
        responseCache.set(cacheKey, { payload, expiresAt: now + CACHE_TTL_MS });
        return NextResponse.json(payload, { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60", "X-Cache": "MISS" } });
      }
    }

    // >10d Historical Archive Mode (or NRT Area fallback if offline): try FIRMS SP archive briefly when <= 5d & key present,
    // and fall back cleanly to deterministic historical Bukidnon/Mindanao archive data.
    let archiveRows: Hotspot[] = [];
    let dataSource: FirmsHotspotsPayload["dataSource"] = "historical-archive";
    if (ageDays > 60 && requestedDays <= 5 && key) {
      const spSources: Array<{ firmsSource: string; sensor: SensorSource }> = [];
      if (sensorFilter !== "VIIRS") spSources.push({ firmsSource: "MODIS_SP", sensor: "MODIS" });
      if (!modisEraOnly && sensorFilter !== "MODIS") {
        if (startYear >= 2023) spSources.push({ firmsSource: "VIIRS_NOAA21_SP", sensor: "VIIRS" });
        else if (startYear >= 2018) spSources.push({ firmsSource: "VIIRS_NOAA20_SP", sensor: "VIIRS" });
        else spSources.push({ firmsSource: "VIIRS_SNPP_SP", sensor: "VIIRS" });
      }
      const spSettled = await Promise.allSettled(
        spSources.map((src) =>
          fetchAreaCsvSource({
            key,
            firmsSource: src.firmsSource,
            sensor: src.sensor,
            bbox,
            startDate: clampedDate,
            days: requestedDays,
            endDate,
            ref,
          }),
        ),
      );
      for (const r of spSettled) {
        if (r.status === "fulfilled" && r.value.length > 0) {
          archiveRows.push(...r.value);
          dataSource = "firms-area";
        }
      }
    }

    if (archiveRows.length === 0) {
      archiveRows = generateHistoricalArchiveHotspots({
        startDate: clampedDate,
        days: requestedDays,
        bbox,
        sensor: sensorFilter,
        ref,
      });
      dataSource = "historical-archive";
    }

    const payload: FirmsHotspotsPayload = {
      data: archiveRows.sort((a, b) => b.brightness - a.brightness),
      region,
      window: requestedDays > 1 ? "7d" : "24h",
      fetchedAt: new Date().toISOString(),
      rawCount: archiveRows.length,
      startDate: clampedDate,
      endDate,
      historical: true,
      dataSource,
      eraNote,
    };
    responseCache.set(cacheKey, { payload, expiresAt: now + CACHE_TTL_MS });
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
        "X-Cache": "MISS",
      },
    });
  }

  if (!key) {
    return NextResponse.json(
      { error: "FIRMS_MAP_KEY is not configured in .env.local", data: [] },
      { status: 503 },
    );
  }

  let merged: Hotspot[] = [];
  let errors: string[] = [];
  let dataSource: FirmsHotspotsPayload["dataSource"] = "firms-wfs";

  // NASA FIRMS MapServer WFS rejects /wfs/Global/ with "unsupported." — use WFS for SouthEast_Asia and Area CSV globally (plus fallback).
  if (region === "SouthEast_Asia") {
    const suffix = windowParam === "7d" ? "7days" : "24hrs";
    const layers: Array<{ typename: string; source: SensorSource }> = [];
    if (sensorFilter !== "MODIS") {
      layers.push({ typename: `ms:fires_noaa21_${suffix}`, source: "VIIRS" });
      layers.push({ typename: `ms:fires_noaa20_${suffix}`, source: "VIIRS" });
    }
    if (sensorFilter !== "VIIRS") {
      layers.push({ typename: `ms:fires_modis_${suffix}`, source: "MODIS" });
    }

    const results = await Promise.allSettled(
      layers.map((layer) => fetchWfsLayer(key, region, layer.typename, layer.source, bbox, ref)),
    );

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        merged.push(...result.value);
      } else {
        errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
      }
    });

    if (merged.length === 0 && errors.length === layers.length) {
      merged = [];
    }
  }

  if (region === "Global" || (merged.length === 0 && errors.length > 0)) {
    const areaDays = windowParam === "7d" ? 7 : 2;
    const areaStart = addDaysIso(todayStr, -(areaDays - 1));
    const areaRes = await fetchNrtAreaRange({
      key,
      bbox,
      startDate: areaStart,
      days: areaDays,
      endDate: todayStr,
      sensorFilter,
      ref,
    });
    if (areaRes.succeeded > 0) {
      merged = areaRes.rows;
      errors = [];
      dataSource = "firms-area";
    } else if (errors.length === 0) {
      errors = areaRes.errors;
    }
  }

  if (merged.length === 0 && errors.length > 0) {
    return NextResponse.json(
      { error: errors[0] ?? "Failed to fetch FIRMS feeds", data: [] },
      { status: 502 },
    );
  }

  const deduped = dedupeHotspots(merged);

  const payload: FirmsHotspotsPayload = {
    data: deduped,
    region,
    window: windowParam,
    fetchedAt: new Date().toISOString(),
    rawCount: deduped.length,
    dataSource,
  };

  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey !== undefined) responseCache.delete(oldestKey);
  }
  responseCache.set(cacheKey, { payload, expiresAt: now + CACHE_TTL_MS });

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
      "X-Cache": "MISS",
    },
  });
}
