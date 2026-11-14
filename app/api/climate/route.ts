import { NextResponse } from "next/server";
import { HOUR, gfsUrl, latestRun, loadGfs, runLabel, sampleGrid, type GfsGrid } from "@/lib/gfs";
import { heatIndexC } from "@/lib/action-guide";

// Temperature, humidity and today's peak heat index at points, from NOAA GFS 0.25° (2 m above ground).
// Used when Open-Meteo is unavailable (its free quota is per network). Only the points' area is downloaded,
// so each forecast step is a few hundred bytes.
//   GET /api/climate?points=lat,lng;lat,lng   (≤ 100 points)

const QUERY = "var_TMP=on&var_RH=on&lev_2_m_above_ground=on";
const PEAK_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24]; // next 24 h, every 3 h

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("points") ?? "";
  const pts = raw.split(";").slice(0, 100).map((s) => s.split(",").map(Number));
  if (!raw || pts.some((p) => p.length !== 2 || !p.every(Number.isFinite) || Math.abs(p[0]!) > 90 || Math.abs(p[1]!) > 180)) {
    return NextResponse.json({ error: "points must be lat,lng;lat,lng" }, { status: 400 });
  }
  try {
    const run = await latestRun();
    // Area around all points, snapped to whole degrees so neighbouring requests share cached files.
    // shortcut: an area crossing the dateline is downloaded as one wide box; split it if that ever matters.
    const lats = pts.map((p) => p[0]!), lngs = pts.map((p) => p[1]!);
    const box = {
      bottom: Math.max(-90, Math.floor(Math.min(...lats)) - 1),
      top: Math.min(90, Math.ceil(Math.max(...lats)) + 1),
      left: Math.floor(Math.min(...lngs)) - 1,
      right: Math.ceil(Math.max(...lngs)) + 1,
    };
    const fh0 = Math.max(0, Math.round((Date.now() - run.getTime()) / HOUR)); // 0.25° files are hourly
    const steps: GfsGrid[] = await Promise.all(PEAK_HOURS.map((h) => loadGfs(gfsUrl("0p25", run, fh0 + h, QUERY, box), 0.25)));
    const tIdx = (g: GfsGrid) => g.fields.findIndex((f) => f.category === 0 && f.parameter === 0);
    const rhIdx = (g: GfsGrid) => g.fields.findIndex((f) => f.category === 1 && f.parameter === 1);
    const points = pts.map(([lat, lng]) => {
      const lng360 = ((lng! % 360) + 360) % 360;
      const series = steps.map((g) => ({
        t: sampleGrid(g, tIdx(g), lat!, lng360) - 273.15,
        rh: Math.max(0, Math.min(100, sampleGrid(g, rhIdx(g), lat!, lng360))),
      }));
      const now = series[0]!;
      return {
        tempC: Math.round(now.t * 10) / 10,
        humidity: Math.round(now.rh),
        maxHeatIndexC: Math.round(Math.max(...series.map((s) => heatIndexC(s.t, s.rh))) * 10) / 10,
      };
    });
    return NextResponse.json({ run: runLabel(run), points }, { headers: { "Cache-Control": "public, max-age=900" } });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
