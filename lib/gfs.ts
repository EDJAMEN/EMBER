// Server-only: NOAA GFS fields from the NOMADS GRIB filter, cached in memory and shared by every viewer.
import { decodeGrib2, type GribField } from "./grib2";

export const HOUR = 3_600_000;
const NOMADS = "https://nomads.ncep.noaa.gov/cgi-bin";

export interface GfsGrid {
  ni: number;
  nj: number;
  lat1: number; // latitude of row 0
  lng1: number; // longitude of column 0 (0–360)
  dLat: number; // signed: -step when rows run north → south, +step when south → north
  step: number;
  fields: GribField[];
}

export interface Box { left: number; right: number; top: number; bottom: number }

export function gfsUrl(product: "1p00" | "0p25", run: Date, fh: number, query: string, box?: Box) {
  const date = run.toISOString().slice(0, 10).replace(/-/g, "");
  const hh = String(run.getUTCHours()).padStart(2, "0");
  const f = String(fh).padStart(3, "0");
  const region = box ? `&subregion=&leftlon=${box.left}&rightlon=${box.right}&toplat=${box.top}&bottomlat=${box.bottom}` : "";
  return `${NOMADS}/filter_gfs_${product}.pl?dir=%2Fgfs.${date}%2F${hh}%2Fatmos&file=gfs.t${hh}z.pgrb2.${product}.f${f}&${query}${region}`;
}

const cache = new Map<string, Promise<GfsGrid>>();

/** Download + decode one filtered GFS file (cached; retried, since NOMADS is often slow or drops connections). */
export function loadGfs(url: string, step: number): Promise<GfsGrid> {
  let p = cache.get(url);
  if (!p) {
    p = (async () => {
      let last: unknown;
      // Bounded: 2 tries × 25 s, so a stalled NOAA connection can't leave the map waiting for minutes.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
          if (res.status === 403 || res.status === 404) throw Object.assign(new Error(`GFS ${res.status}`), { final: true });
          if (!res.ok) throw new Error(`GFS ${res.status}`);
          const fields = decodeGrib2(new Uint8Array(await res.arrayBuffer()));
          const f = fields[0];
          if (!f) throw new Error("GFS file was empty");
          return { ni: f.ni, nj: f.nj, lat1: f.lat1, lng1: f.lng1, step, dLat: f.scanMode & 0x40 ? step : -step, fields };
        } catch (err) {
          last = err;
          if ((err as { final?: boolean }).final) break; // not published: retrying won't help
        }
      }
      throw last;
    })();
    p.catch(() => cache.delete(url)); // don't cache failures
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    cache.set(url, p);
  }
  return p;
}

/** Bilinear value of field k at a point; longitudes wrap on global grids. */
export function sampleGrid(g: GfsGrid, k: number, lat: number, lng: number): number {
  const vals = g.fields[k]!.values;
  const fy = Math.max(0, Math.min(g.nj - 1, (lat - g.lat1) / g.dLat));
  const global = Math.round(g.ni * g.step) >= 360;
  let fx = (((lng - g.lng1) % 360) + 360) % 360 / g.step;
  if (!global) fx = Math.max(0, Math.min(g.ni - 1, fx));
  const y0 = Math.min(Math.floor(fy), g.nj - 2), ty = fy - y0;
  const x0 = Math.min(Math.floor(fx), global ? g.ni - 1 : g.ni - 2), tx = fx - x0;
  const x1 = global ? (x0 + 1) % g.ni : x0 + 1;
  const at = (y: number, x: number) => vals[y * g.ni + x]!;
  return (at(y0, x0) * (1 - tx) + at(y0, x1) * tx) * (1 - ty) + (at(y0 + 1, x0) * (1 - tx) + at(y0 + 1, x1) * tx) * ty;
}

const WIND_QUERY = "var_UGRD=on&var_VGRD=on&lev_10_m_above_ground=on";
export const windFile = (run: Date, fh: number) => loadGfs(gfsUrl("1p00", run, fh, WIND_QUERY), 1);

// Newest run whose files are out (runs every 6 h, published ~4–5 h later). Remembered for 20 min.
let latest: { run: Date; checked: number } | null = null;
export async function latestRun(): Promise<Date> {
  if (latest && Date.now() - latest.checked < 20 * 60_000) return latest.run;
  const now = Date.now();
  // A run younger than ~4 h is never complete, and NOMADS hangs on missing files: start one run earlier then.
  const cycle = Math.floor((now - 4 * HOUR) / (6 * HOUR)) * 6 * HOUR;
  let lastErr: unknown;
  // Check the last 3 runs at once (not one after another) and take the newest that's available.
  const runs = [0, 1, 2].map((k) => new Date(cycle - k * 6 * HOUR));
  const ok = await Promise.all(
    runs.map((run) =>
      windFile(run, Math.ceil((now - run.getTime()) / (3 * HOUR)) * 3 + 6) // fire spread needs now + 6 h
        .then(() => true)
        .catch((err) => ((lastErr = err), false)),
    ),
  );
  const run = runs[ok.indexOf(true)];
  if (run) {
    latest = { run, checked: Date.now() };
    return run;
  }
  if (latest) return latest.run; // NOAA unreachable: keep using the last run we know works
  throw new Error(`NOAA GFS is unreachable right now (${(lastErr as Error)?.message ?? "no response"})`);
}

export const runLabel = (run: Date) => `GFS ${run.toISOString().slice(0, 10)} ${String(run.getUTCHours()).padStart(2, "0")}Z`;
