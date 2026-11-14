import { NextResponse } from "next/server";

const GADM_URL = "https://geodata.ucdavis.edu/gadm/gadm4.1/json/gadm41_PHL_2.json";
const TTL_MS = 24 * 60 * 60 * 1000;

let cached: { body: string; expiresAt: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return new NextResponse(cached.body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        "X-Cache": "HIT",
      },
    });
  }

  try {
    const res = await fetch(GADM_URL, { next: { revalidate: 86400 } });
    if (!res.ok) {
      return NextResponse.json({ error: `GADM responded ${res.status}` }, { status: 502 });
    }
    const body = await res.text();
    cached = { body, expiresAt: now + TTL_MS };
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=3600",
        "X-Cache": "MISS",
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
