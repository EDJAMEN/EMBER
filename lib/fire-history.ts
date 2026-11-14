// Daily fire counts for an area from NASA FIRMS VIIRS (NOAA-20) records. Pure functions; I/O is in the API route.
//
// Accuracy rules (each one changes the numbers people read):
// - Only vegetation fires: FIRMS archive rows carry `type` (0 vegetation, 1 volcano, 2 static land source such as
//   factories/flares, 3 offshore). Recent (NRT) rows have no type, so they are dropped when they sit on a spot the
//   archive marks as a static source.
// - Low-confidence detections are dropped (often sun glint or hot surfaces, not fire).
// - Days are LOCAL days for the area (solar offset from its longitude), not UTC: a 1:30 am overpass in the
//   Philippines is 17:30 UTC the day before.

export interface Detection {
  lat: number;
  lng: number;
  date: string; // UTC YYYY-MM-DD
  time: string; // UTC HHMM
  conf: string; // VIIRS: l | n | h
  type: number | null; // null on NRT rows
}

/** Parse a FIRMS CSV (area API or yearly country file); columns are found by name. */
export function parseFirmsCsv(text: string): Detection[] {
  const lines = text.trim().split(/\r?\n/);
  const head = (lines[0] ?? "").split(",").map((h) => h.trim());
  const col = (name: string) => head.indexOf(name);
  const [iLat, iLng, iDate, iTime, iConf, iType] = ["latitude", "longitude", "acq_date", "acq_time", "confidence", "type"].map(col);
  if (iLat! < 0 || iLng! < 0 || iDate! < 0) return [];
  const out: Detection[] = [];
  for (let k = 1; k < lines.length; k++) {
    const c = lines[k]!.split(",");
    const lat = Number(c[iLat!]), lng = Number(c[iLng!]);
    const date = c[iDate!] ?? "";
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const t = iType! >= 0 ? Number(c[iType!]) : NaN;
    out.push({
      lat,
      lng,
      date,
      time: (c[iTime!] ?? "0").trim().padStart(4, "0"),
      conf: (c[iConf!] ?? "").trim().toLowerCase(),
      type: Number.isFinite(t) ? t : null,
    });
  }
  return out;
}

/** Whole-hour solar offset for a longitude (e.g. 125°E → +8). */
export const solarOffset = (lng: number) => Math.round(lng / 15);

/** The local calendar date of a UTC date + HHMM time, for a whole-hour offset. */
export function localDate(date: string, time: string, offsetHours: number): string {
  const ms = Date.parse(`${date}T${time.slice(0, 2)}:${time.slice(2, 4)}:00Z`) + offsetHours * 3_600_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// ~550 m grid cells for "is this a known static source (factory, flare)?" lookups.
const cell = (lat: number, lng: number) => `${Math.round(lat * 200)},${Math.round(lng * 200)}`;

export function staticSources(dets: Detection[]): Set<string> {
  const s = new Set<string>();
  for (const d of dets) if (d.type === 2 || d.type === 3) s.add(cell(d.lat, d.lng));
  return s;
}

function nearStatic(s: Set<string>, lat: number, lng: number): boolean {
  const y = Math.round(lat * 200), x = Math.round(lng * 200);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (s.has(`${y + dy},${x + dx}`)) return true;
  return false;
}

export interface Tally {
  counts: Map<string, number>; // local date → vegetation-fire detections inside the area
  removed: { notVegetation: number; lowConfidence: number };
}

/** Count detections per local day inside the area, applying the accuracy rules above. */
export function tallyDaily(
  dets: Detection[],
  inside: (lng: number, lat: number) => boolean,
  offsetHours: number,
  statics: Set<string>,
): Tally {
  const counts = new Map<string, number>();
  const removed = { notVegetation: 0, lowConfidence: 0 };
  for (const d of dets) {
    if (!inside(d.lng, d.lat)) continue;
    if (d.type !== null ? d.type !== 0 : nearStatic(statics, d.lat, d.lng)) {
      removed.notVegetation++;
      continue;
    }
    if (d.conf.startsWith("l")) {
      removed.lowConfidence++;
      continue;
    }
    const day = localDate(d.date, d.time, offsetHours);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return { counts, removed };
}

/** 5-day request windows (the FIRMS area API maximum) covering [from, to]. */
export function chunks(from: string, to: string, size = 5): { start: string; days: number }[] {
  const out: { start: string; days: number }[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += size * 86_400_000) {
    out.push({ start: new Date(t).toISOString().slice(0, 10), days: Math.min(size, Math.round((end - t) / 86_400_000) + 1) });
  }
  return out;
}
