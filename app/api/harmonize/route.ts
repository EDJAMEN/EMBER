import { NextRequest, NextResponse } from "next/server";
import { HOTSPOTS } from "@/lib/hotspots";
import {
  harmonizeFireGeoJson,
  harmonizeHotspots,
  type RawFirePoint,
} from "@/lib/harmonization";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const radiusKm = parseFloat(searchParams.get("radius") || "1.0");

  const rawCount = HOTSPOTS.length;
  const harmonized = harmonizeHotspots(HOTSPOTS, radiusKm);
  const fusedCount = harmonized.length;
  const deduplicatedCount = rawCount - fusedCount;

  return NextResponse.json({
    status: "SUCCESS",
    algorithm: "Spatial Data Harmonization (MODIS + VIIRS)",
    clustering_radius_km: radiusKm,
    statistics: {
      raw_detections: rawCount,
      fused_clusters: fusedCount,
      duplicates_removed: deduplicatedCount,
      deduplication_rate_percent: Math.round((deduplicatedCount / (rawCount || 1)) * 100),
      multi_sensor_clusters: harmonized.filter((h) => h.isMultiSensor).length,
    },
    data: harmonized,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const radiusKm = typeof body.radius_km === "number" ? body.radius_km : 1.0;

    if (body.type === "FeatureCollection" && Array.isArray(body.features)) {
      const geojsonResult = harmonizeFireGeoJson(body.features as RawFirePoint[], radiusKm);
      return NextResponse.json(geojsonResult);
    }

    if (Array.isArray(body.hotspots)) {
      const harmonized = harmonizeHotspots(body.hotspots, radiusKm);
      return NextResponse.json({ data: harmonized });
    }

    return NextResponse.json(
      { error: "Expected a GeoJSON FeatureCollection or a { hotspots: Hotspot[] } payload." },
      { status: 400 }
    );
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
