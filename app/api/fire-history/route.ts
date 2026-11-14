import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextResponse, after } from "next/server";
import { bbox as turfBbox, booleanPointInPolygon, circle } from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import { type Detection, chunks, parseFirmsCsv, solarOffset, staticSources, tallyDaily } from "@/lib/fire-history";
import type { BoundaryPayload, LevelsPayload } from "@/app/api/boundary/route";

// Daily vegetation-fire counts for a searched area, from NASA FIRMS VIIRS NOAA-20 (375 m), last 5 years + this year.
//   GET ?lat&lng&name[&osm&kind]  → { status: "loading", progress, message } | { status: "ready", ... } | { status: "error" }
// Past years come from FIRMS' free yearly per-country files (no MAP_KEY transactions); the current year (and any
// year without a country file) from the area API in 5-day windows. Everything downloaded is cached on disk, so a
// place is slow only the first time, and every place in a country shares that country's files.

const FIRMS = "https://firms.modaps.eosdis.nasa.gov";
const SENSOR = { sp: "VIIRS_NOAA20_SP", nrt: "VIIRS_NOAA20_NRT", file: "viirs-jpss1" } as const;
const YEARS_BACK = 5;
const CACHE_DIR = join(tmpdir(), "ember-firms-cache");
const NO_BORDER_RADIUS_KM = 5;

type Status =
  // `partial`: what's counted so far (null = day not fetched yet), so the calendar can show while the rest loads.
  | { status: "loading"; progress: number; message: string; partial?: HistoryPayload }
  | { status: "error"; message: string }
  | ({ status: "ready" } & HistoryPayload);

export interface HistoryPayload {
  area: { name: string; kind: string | null; approximate: boolean; country: string | null };
  firstDate: string; // local date of counts[0]
  lastDate: string; // last complete local day
  counts: (number | null)[]; // one per local day, firstDate..lastDate; null only while still loading
  source: string;
  removed: { notVegetation: number; lowConfidence: number };
  updated: string;
}

const jobs = new Map<string, { state: Status; at: number }>();
const lastReady = new Map<string, Status>();
const READY_TTL = 3 * 3_600_000; // recompute (cheaply, from disk) every 3 h so recent days stay fresh

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const safe = (s: string) => s.replace(/[^\w.-]+/g, "_");

async function cached(name: string, maxAgeMs: number | null, load: () => Promise<string>): Promise<string> {
  const file = join(CACHE_DIR, safe(name));
  try {
    const s = await stat(file);
    if (maxAgeMs === null || Date.now() - s.mtimeMs < maxAgeMs) return await readFile(file, "utf8");
  } catch {
    /* not cached yet */
  }
  const text = await load();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(file, text, "utf8");
  return text;
}

async function getText(url: string, timeoutMs = 120_000): Promise<{ status: number; text: string }> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
      return { status: res.status, text: await res.text() };
    } catch (err) {
      last = err;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw last;
}

// FIRMS answers errors as plain text with status 200 sometimes; only a CSV header means data.
const isCsv = (t: string) => t.startsWith("latitude");

let availability: { at: number; dates: Record<string, { min: string; max: string }> } | null = null;
async function dataAvailability(key: string) {
  if (availability && Date.now() - availability.at < 6 * 3_600_000) return availability.dates;
  const { text } = await getText(`${FIRMS}/api/data_availability/csv/${key}/all`, 30_000);
  const dates: Record<string, { min: string; max: string }> = {};
  for (const line of text.trim().split(/\r?\n/).slice(1)) {
    const [id, min, max] = line.split(",");
    if (id && min && max) dates[id] = { min, max };
  }
  if (!dates[SENSOR.sp] || !dates[SENSOR.nrt]) throw new Error("NASA FIRMS did not report its data dates");
  availability = { at: Date.now(), dates };
  return dates;
}

/** Wait while the MAP_KEY is near its 10-minute transaction limit (shared with the live map). */
async function respectBudget(key: string, onWait: (msg: string) => void) {
  for (;;) {
    try {
      const { text } = await getText(`${FIRMS}/mapserver/mapkey_status/?MAP_KEY=${key}`, 15_000);
      const s = JSON.parse(text) as { transaction_limit?: number; current_transactions?: number };
      if (!s.transaction_limit || (s.current_transactions ?? 0) < s.transaction_limit * 0.7) return;
    } catch {
      return; // status unknown: carry on; FIRMS itself will refuse if over
    }
    onWait("Waiting a moment for NASA's request limit to reset…");
    await sleep(60_000);
  }
}

async function areaChunk(key: string, source: string, box: string, start: string, days: number, final: boolean) {
  const name = `area_${source}_${box}_${start}_${days}.csv`;
  // Archive windows never change; recent (NRT) windows are refreshed after 3 h.
  return cached(name, final ? null : 3 * 3_600_000, async () => {
    const { status, text } = await getText(`${FIRMS}/api/area/csv/${key}/${source}/${box}/${days}/${start}`);
    if (status !== 200 || !isCsv(text)) throw new Error(`NASA FIRMS refused a request (${text.slice(0, 80).trim() || status})`);
    return text;
  });
}

async function countryYear(country: string, year: number): Promise<string | null> {
  const file = `${SENSOR.file}_${year}_${country.replace(/ /g, "_")}.csv`;
  try {
    return await cached(`country_${file}`, null, async () => {
      const { status, text } = await getText(`${FIRMS}/data/country/${SENSOR.file}/${year}/${file}`, 600_000);
      if (status === 404) throw Object.assign(new Error("missing"), { missing: true });
      if (status !== 200 || !isCsv(text)) throw new Error(`NASA country file ${file}: ${status}`);
      return text;
    });
  } catch (err) {
    if ((err as { missing?: boolean }).missing) return null; // not published (yet), or a different country name
    throw err;
  }
}

async function resolveArea(origin: string, p: URLSearchParams) {
  const lat = Number(p.get("lat")), lng = Number(p.get("lng"));
  const levels = (await (await fetch(`${origin}/api/boundary?lat=${lat}&lng=${lng}`)).json()) as LevelsPayload;
  const country = levels.levels?.find((l) => l.key === "country")?.name ?? null;
  let border: BoundaryPayload | null = null;
  const osm = p.get("osm");
  if (osm) {
    border = (await (await fetch(`${origin}/api/boundary?lat=${lat}&lng=${lng}&osm=${osm}&kind=${encodeURIComponent(p.get("kind") ?? "")}`)).json()) as BoundaryPayload;
  } else {
    const level = levels.levels?.find((l) => l.key === levels.defaultKey);
    if (level) {
      border = (await (
        await fetch(`${origin}/api/boundary?lat=${lat}&lng=${lng}&level=${level.key}&name=${encodeURIComponent(level.name)}`)
      ).json()) as BoundaryPayload;
    }
  }
  const name = border?.name ?? p.get("name") ?? "Selected place";
  if (border?.geometry) return { name, kind: border.kind, geometry: border.geometry, approximate: false, country, lat, lng };
  // No mapped border (e.g. a barangay mapped as a point): a clearly labelled 5 km circle around it.
  const geometry = circle([lng, lat], NO_BORDER_RADIUS_KM, { units: "kilometers", steps: 48 }).geometry as Polygon;
  return { name, kind: border?.kind ?? null, geometry, approximate: true, country, lat, lng };
}

async function run(jobKey: string, origin: string, p: URLSearchParams) {
  const set = (state: Status) => jobs.set(jobKey, { state, at: Date.now() });
  const key = process.env.FIRMS_MAP_KEY?.trim() || process.env.NASA_FIRMS_MAP_KEY?.trim();
  if (!key) return set({ status: "error", message: "The NASA FIRMS key is not set up on this server." });
  try {
    set({ status: "loading", progress: 2, message: "Finding the area on the map…" });
    const area = await resolveArea(origin, p);
    const avail = await dataAvailability(key);
    const nrtMax = avail[SENSOR.nrt]!.max;
    const spMax = avail[SENSOR.sp]!.max;
    const offset = solarOffset(area.lng);
    // Complete local days only: the latest UTC day is still being observed.
    const lastDate = new Date(Date.parse(`${nrtMax}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const thisYear = Number(lastDate.slice(0, 4));
    const firstYear = thisYear - YEARS_BACK;
    const firstDate = `${firstYear}-01-01`;

    const [w, s, e, n] = turfBbox(area.geometry);
    const box = [Math.floor(w * 100) / 100, Math.floor(s * 100) / 100, Math.ceil(e * 100) / 100, Math.ceil(n * 100) / 100].join(",");

    const geom = area.geometry as Polygon | MultiPolygon;
    const inside = (x: number, y: number) => x >= w && x <= e && y >= s && y <= n && booleanPointInPolygon([x, y], geom);
    const dets: Detection[] = [];
    const loaded = new Set<string>(); // UTC dates fetched so far
    const markLoaded = (from: string, to: string) => {
      for (let d = from; d <= to; d = nextDay(d)) loaded.add(d);
    };
    // A local day is complete once every UTC date it overlaps is loaded.
    const known = (d: string) => loaded.has(d) && (offset > 0 ? loaded.has(addDaysIso(d, -1)) : offset < 0 ? loaded.has(nextDay(d)) : true);
    const payload = (): HistoryPayload => {
      const tally = tallyDaily(dets, inside, offset, staticSources(dets));
      const counts: (number | null)[] = [];
      for (let d = firstDate; d <= lastDate; d = nextDay(d)) counts.push(known(d) ? (tally.counts.get(d) ?? 0) : null);
      return {
        area: { name: area.name, kind: area.kind, approximate: area.approximate, country: area.country },
        firstDate,
        lastDate,
        counts,
        source: "NASA FIRMS · VIIRS NOAA-20 (375 m)",
        removed: tally.removed,
        updated: new Date().toISOString(),
      };
    };

    // Work units, newest first: the calendar opens on the latest month, so that fills in first.
    type Win = { source: string; start: string; days: number; final: boolean };
    const windows = (from: string, to: string): Win[] => {
      const out: Win[] = [];
      for (const [src, a, b] of [
        [SENSOR.sp, from, to < spMax ? to : spMax],
        [SENSOR.nrt, from > spMax ? from : nextDay(spMax), to],
      ] as const) {
        if (a > b) continue;
        for (const c of chunks(a, b)) {
          const end = addDaysIso(c.start, c.days - 1);
          out.push({ source: src, start: c.start, days: c.days, final: src === SENSOR.sp || end < addDaysIso(nrtMax, -3) });
        }
      }
      return out.reverse();
    };
    const years = Array.from({ length: thisYear - firstYear + 1 }, (_, i) => thisYear - i); // newest first
    let done = 0;
    const total = years.length + 1;
    const progress = (message: string, withData: boolean) =>
      set({ status: "loading", progress: Math.min(97, Math.round((done / total) * 100)), message, ...(withData ? { partial: payload() } : {}) });

    // Area windows, 8 at a time (MAP_KEY budget checked every 40), adding partial results as they arrive.
    const fetchWindows = async (wins: Win[], label: string) => {
      for (let i = 0; i < wins.length; i += 8) {
        if (i % 40 === 0) await respectBudget(key, (msg) => progress(msg, false));
        const group = wins.slice(i, i + 8);
        const texts = await Promise.all(group.map((c) => areaChunk(key, c.source, box, c.start, c.days, c.final)));
        texts.forEach((t, k) => {
          dets.push(...parseFirmsCsv(t));
          markLoaded(group[k]!.start, addDaysIso(group[k]!.start, group[k]!.days - 1));
        });
        progress(label, true);
      }
    };

    for (const y of years) {
      // The current year (+ the next UTC day, for areas west of Greenwich) never has a country file yet.
      const text = y < thisYear && area.country ? await countryYear(area.country, y) : null;
      if (text) {
        dets.push(...parseFirmsCsv(text));
        markLoaded(`${y}-01-01`, `${y}-12-31`);
      } else {
        await fetchWindows(windows(`${y}-01-01`, y === thisYear ? nextDay(lastDate) : `${y}-12-31`), `Getting ${y} satellite records for ${area.name}…`);
      }
      done++;
      progress(`Added ${y}. Getting earlier years…`, true);
    }
    // Local day 1 of the first year starts the previous UTC evening when the area is east of Greenwich.
    if (offset > 0) await fetchWindows(windows(addDaysIso(firstDate, -1), addDaysIso(firstDate, -1)), "Finishing…");

    const final = payload();
    set({ status: "ready", ...final });
    void saveResult(jobKey, final);
  } catch (err) {
    set({ status: "error", message: (err as Error).message || "Something went wrong getting NASA records." });
  }
}

// Finished results survive restarts (and are shared by every visitor of this server).
const resultFile = (jobKey: string) => join(CACHE_DIR, `result_${safe(jobKey)}.json`);
async function saveResult(jobKey: string, r: HistoryPayload) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(resultFile(jobKey), JSON.stringify(r), "utf8");
  } catch {
    /* read-only disk: memory cache still works */
  }
}
async function loadResult(jobKey: string): Promise<{ r: HistoryPayload; age: number } | null> {
  try {
    const f = resultFile(jobKey);
    return { r: JSON.parse(await readFile(f, "utf8")) as HistoryPayload, age: Date.now() - (await stat(f)).mtimeMs };
  } catch {
    return null;
  }
}

function addDaysIso(d: string, n: number) {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
const nextDay = (d: string) => addDaysIso(d, 1);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const p = url.searchParams;
  const lat = Number(p.get("lat")), lng = Number(p.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ status: "error", message: "lat/lng out of range" }, { status: 400 });
  }
  const osm = p.get("osm");
  if (osm && !/^[NWR]\d{1,12}$/.test(osm)) return NextResponse.json({ status: "error", message: "bad osm id" }, { status: 400 });
  const jobKey = osm ?? `${lat.toFixed(3)},${lng.toFixed(3)}`;

  let job = jobs.get(jobKey);
  if (!job) {
    // Saved on disk from an earlier visit: answer instantly (and refresh in the background if it's old).
    const saved = await loadResult(jobKey);
    if (saved) {
      job = { state: { status: "ready", ...saved.r }, at: Date.now() - saved.age };
      jobs.set(jobKey, job);
    }
  }
  if (job?.state.status === "ready") lastReady.set(jobKey, job.state);
  const stale = !job || job.state.status === "error" || (job.state.status === "ready" && Date.now() - job.at > READY_TTL);
  if (stale) {
    if (jobs.size > 200) jobs.delete(jobs.keys().next().value!);
    jobs.set(jobKey, { state: { status: "loading", progress: 0, message: "Starting…" }, at: Date.now() });
    // Runs after the response is sent (kept alive on serverless hosts too); the page polls for progress.
    after(() => run(jobKey, url.origin, p));
  }
  // While a 3-hourly refresh runs, keep serving the previous result instead of flipping back to "loading".
  const state = jobs.get(jobKey)!.state;
  const shown = state.status === "loading" && lastReady.has(jobKey) ? lastReady.get(jobKey)! : state;
  // Finished results can be cached by the host's CDN for everyone; progress must not be.
  const cache = shown.status === "ready" ? "public, max-age=300, s-maxage=10800, stale-while-revalidate=86400" : "no-store";
  return NextResponse.json(shown, { headers: { "Cache-Control": cache } });
}
