import { NextRequest, NextResponse } from "next/server";

const WMS_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const DEFAULT_LAYERS = "fires_viirs_24,fires_modis_24,fires_landsat_24";

interface CachedTile {
  data: ArrayBuffer;
  contentType: string;
  expiresAt: number;
}

const tileCache = new Map<string, CachedTile>();

function getParam(searchParams: URLSearchParams, key: string): string | null {
  return searchParams.get(key) ?? searchParams.get(key.toLowerCase()) ?? searchParams.get(key.toUpperCase());
}

export async function HEAD() {
  const key = process.env.FIRMS_MAP_KEY?.trim() || process.env.NASA_FIRMS_MAP_KEY?.trim();
  return new NextResponse(null, { status: key ? 204 : 503 });
}

export async function GET(request: NextRequest) {
  const key = process.env.FIRMS_MAP_KEY?.trim() || process.env.NASA_FIRMS_MAP_KEY?.trim();
  if (!key) {
    return NextResponse.json(
      { error: "FIRMS_MAP_KEY is not configured in .env.local" },
      { status: 503 },
    );
  }

  const { searchParams } = request.nextUrl;
  const bbox = getParam(searchParams, "BBOX");
  if (!bbox) {
    return NextResponse.json({ error: "Missing required BBOX parameter" }, { status: 400 });
  }

  const layers = getParam(searchParams, "LAYERS") || DEFAULT_LAYERS;
  const width = getParam(searchParams, "WIDTH") || "256";
  const height = getParam(searchParams, "HEIGHT") || "256";
  const srs = getParam(searchParams, "SRS") || "EPSG:3857";
  const format = getParam(searchParams, "FORMAT") || "image/png";
  const transparent = getParam(searchParams, "TRANSPARENT") || "true";

  const cacheKey = `${layers}|${srs}|${width}x${height}|${bbox}`;
  const now = Date.now();
  const cached = tileCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return new NextResponse(cached.data, {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
        "X-Cache": "HIT",
      },
    });
  }

  const upstreamParams = new URLSearchParams({
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetMap",
    LAYERS: layers,
    FORMAT: format,
    TRANSPARENT: transparent,
    SRS: srs,
    WIDTH: width,
    HEIGHT: height,
    BBOX: bbox,
  });

  const upstreamUrl = `https://firms.modaps.eosdis.nasa.gov/mapserver/wms/fires/${encodeURIComponent(key)}/?${upstreamParams.toString()}`;

  try {
    const res = await fetch(upstreamUrl, { next: { revalidate: 300 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: `FIRMS WMS responded with ${res.status}` },
        { status: res.status >= 500 ? 502 : res.status },
      );
    }

    const contentType = res.headers.get("content-type") || "image/png";
    const data = await res.arrayBuffer();

    if (tileCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = tileCache.keys().next().value;
      if (oldestKey !== undefined) tileCache.delete(oldestKey);
    }
    tileCache.set(cacheKey, { data, contentType, expiresAt: now + WMS_TTL_MS });

    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
        "X-Cache": "MISS",
      },
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 502 });
  }
}
