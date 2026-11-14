import { createHash } from "node:crypto";
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

// When the MAP_KEY is refused (invalid, or over its 5000-per-10-min limit) FIRMS still answers "200 image/png",
// with a picture of the error text. Fingerprint of that picture, so it is never painted onto the map.
const REFUSAL_TILE_SHA256 = "75d876f3c684a2021a356553a08257dc2d57cb13ff9d24c147476490c499cea4";
// 1×1 transparent PNG, served instead of refused tiles.
const EMPTY_TILE = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const emptyTile = (reason: string) =>
  new NextResponse(EMPTY_TILE, {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "X-Firms-Skipped": reason },
  });

// Raster dots are optional; the live detections (WFS) and fire spread need the same key. Stop fetching tiles
// once 80% of the key's 10-minute budget is used, so those keep working. Status is checked at most once a minute.
const BUDGET_SHARE = 0.8;
let budget: { ok: boolean; checked: number } = { ok: true, checked: 0 };
async function tileBudgetOk(key: string): Promise<boolean> {
  if (Date.now() - budget.checked < 60_000) return budget.ok;
  try {
    const res = await fetch(`https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${encodeURIComponent(key)}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const s = (await res.json()) as { transaction_limit?: number; current_transactions?: number };
    const ok = !s.transaction_limit || (s.current_transactions ?? 0) < s.transaction_limit * BUDGET_SHARE;
    budget = { ok, checked: Date.now() };
  } catch {
    budget = { ok: budget.ok, checked: Date.now() }; // status unknown: keep the last answer
  }
  return budget.ok;
}

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
  const time = getParam(searchParams, "TIME");

  const cacheKey = `${layers}|${srs}|${width}x${height}|${time ?? "latest"}|${bbox}`;
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

  if (!(await tileBudgetOk(key))) return emptyTile("key budget nearly used");

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
  if (time && /^\d{4}-\d{2}-\d{2}$/.test(time.trim())) {
    upstreamParams.set("TIME", time.trim());
  }

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
    if (createHash("sha256").update(Buffer.from(data)).digest("hex") === REFUSAL_TILE_SHA256) {
      budget = { ok: false, checked: Date.now() }; // over the limit: pause tiles for a minute
      return emptyTile("FIRMS refused the MAP_KEY");
    }

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
