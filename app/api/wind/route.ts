import { NextResponse } from "next/server";
import { HOUR, latestRun, runLabel, sampleGrid, windFile } from "@/lib/gfs";

// Global 10 m wind from NOAA GFS (the model wind maps like Zoom Earth / earth.nullschool use), 1° grid.
//   GET /api/wind                          → whole-planet u/v for "now" (blended between forecast steps)
//   GET /api/wind?points=lat,lng;lat,lng   → hourly wind for the next 6 h at each point (fire spread)

const GRID = { ni: 360, nj: 181, lat1: 90, lng1: 0, step: 1 };

/** u/v at time t (ms), linearly blended between the two 3-hourly forecast steps around it. */
async function fieldAt(run: Date, t: number) {
  const h = Math.max(0, (t - run.getTime()) / HOUR);
  const a = Math.floor(h / 3) * 3;
  const w = (h - a) / 3;
  const [fa, fb] = await Promise.all([windFile(run, a), windFile(run, a + 3)]);
  const blend = (k: number) => Float32Array.from(fa.fields[k]!.values, (x, i) => x * (1 - w) + fb.fields[k]!.values[i]! * w);
  return { ...fa, fields: [{ ...fa.fields[0]!, values: blend(0) }, { ...fa.fields[1]!, values: blend(1) }] };
}

const toB64 = (arr: Float32Array) => {
  const i16 = Int16Array.from(arr, (x) => Math.max(-32767, Math.min(32767, Math.round(x * 100)))); // cm/s
  return Buffer.from(i16.buffer).toString("base64"); // little-endian, as the client reads it
};

// Last good global payload: served (marked stale) when NOAA can't be reached, so the animation keeps working.
let lastGood: { body: Record<string, unknown>; at: number } | null = null;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const pointsParam = params.get("points");
  try {
    const run = await latestRun();
    const now = Date.now();

    if (pointsParam !== null) {
      const pts = pointsParam.split(";").slice(0, 60).map((s) => s.split(",").map(Number));
      if (pts.some((p) => p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]!) > 90 || Math.abs(p[1]!) > 180)) {
        return NextResponse.json({ error: "points must be lat,lng;lat,lng" }, { status: 400 });
      }
      const hours = await Promise.all(Array.from({ length: 7 }, (_, k) => fieldAt(run, now + k * HOUR)));
      const points = pts.map(([lat, lng]) =>
        hours.map((g) => {
          const u = sampleGrid(g, 0, lat!, lng!) * 3.6, v = sampleGrid(g, 1, lat!, lng!) * 3.6;
          return {
            speedKmh: Math.round(Math.hypot(u, v) * 10) / 10,
            dirFrom: Math.round(((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360),
          };
        }),
      );
      return NextResponse.json({ run: runLabel(run), points }, { headers: { "Cache-Control": "public, max-age=600" } });
    }

    const g = await fieldAt(run, now);
    const body = { ...GRID, run: runLabel(run), validTime: new Date(now).toISOString(), u: toB64(g.fields[0]!.values), v: toB64(g.fields[1]!.values) };
    lastGood = { body, at: now };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch (err) {
    if (pointsParam === null && lastGood) {
      return NextResponse.json({ ...lastGood.body, stale: true }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
