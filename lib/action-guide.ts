// Smart Action Guide: rule-based translation of hotspots + heat + air quality into guidance.
// General preparedness guidance only — to be reviewed with DRRMO / health authorities.

export type HeatLevel = "None" | "Caution" | "Extreme Caution" | "Danger" | "Extreme Danger";

/** NWS Rothfusz heat index, °C in → °C out. */
export function heatIndexC(tempC: number, rh: number): number {
  const t = (tempC * 9) / 5 + 32;
  let hi = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094);
  if (hi >= 80) {
    // shortcut: skips NWS low/high-humidity adjustments (±1°C at the extremes)
    hi =
      -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t -
      0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh;
  }
  return ((hi - 32) * 5) / 9;
}

// PAGASA classification (README); keep in sync with current PAGASA thresholds before release.
export function heatLevel(hiC: number): HeatLevel {
  const c = Math.round(hiC);
  if (c >= 52) return "Extreme Danger";
  if (c >= 42) return "Danger";
  if (c >= 33) return "Extreme Caution";
  if (c >= 27) return "Caution";
  return "None";
}

export interface NearbyHotspot {
  distanceKm: number;
  highConfidence: boolean;
}

export interface GuideInput {
  hotspots: NearbyHotspot[] | null; // null = hotspot feed unavailable
  tempC: number | null;
  humidity: number | null;
  windKmh: number | null;
  usAqi: number | null;
}

export interface Guide {
  heatIndex: number | null;
  heat: HeatLevel;
  nearbyCount: number;
  nearestKm: number | null;
  update: string[];
  todo: string[];
  bring: string[];
  prepare: string[];
}

export const NEARBY_KM = 25;
const CLOSE_KM = 5;

export function buildGuide(input: GuideInput): Guide {
  const update: string[] = [];
  const todo: string[] = [];
  const bring = ["Drinking water", "First-aid kit", "Flashlight and spare batteries"];
  const prepare = ["Charged phone and power bank", "List of emergency hotlines (local DRRMO, BFP, barangay)"];

  const nearby = (input.hotspots ?? []).filter((h) => h.distanceKm <= NEARBY_KM);
  const nearestKm = nearby.length ? Math.min(...nearby.map((h) => h.distanceKm)) : null;
  const strong = nearby.some((h) => h.highConfidence);

  if (input.hotspots === null) {
    update.push("Satellite hotspot data is unavailable right now.");
  } else if (nearby.length === 0) {
    update.push(`No satellite hotspots detected within ${NEARBY_KM} km in the last 48 hours.`);
  } else {
    update.push(
      `${nearby.length} hotspot cluster${nearby.length > 1 ? "s" : ""} detected within ${NEARBY_KM} km; nearest about ${nearestKm!.toFixed(1)} km away${strong ? " (high confidence)" : ""}.`,
    );
    todo.push("Check the exact hotspot location and verify against official fire reports.");
    todo.push("Monitor announcements from your local DRRMO.");
    if (nearestKm! <= CLOSE_KM) {
      todo.push("Keep away from the burning area and do not attempt to fight large fires yourself.");
      todo.push("Be ready to leave if local authorities advise evacuation.");
      prepare.push("Go-bag with IDs, medicines, clothes and important documents");
      prepare.push("Know your evacuation route and meeting point");
    }
    if (input.windKmh !== null && input.windKmh >= 20) {
      update.push(`Winds of ${Math.round(input.windKmh)} km/h can spread fire and smoke quickly.`);
    }
  }
  update.push("A satellite hotspot is a heat anomaly, not automatically a confirmed wildfire.");

  const heatIndex =
    input.tempC !== null && input.humidity !== null ? heatIndexC(input.tempC, input.humidity) : null;
  const heat = heatIndex === null ? "None" : heatLevel(heatIndex);
  if (heatIndex !== null) {
    update.push(`Heat index ${Math.round(heatIndex)}°C${heat === "None" ? "" : ` (${heat})`}.`);
  }
  if (heat !== "None") {
    todo.push("Drink water regularly, even before feeling thirsty.");
    bring.push("Hat or umbrella, light loose clothing");
  }
  if (heat === "Extreme Caution" || heat === "Danger" || heat === "Extreme Danger") {
    todo.push("Limit outdoor activity during the hottest hours (about 10 AM–4 PM).");
    todo.push("Check on children, older adults and people with health conditions.");
    prepare.push("A cool, shaded or ventilated place to rest");
  }
  if (heat === "Danger" || heat === "Extreme Danger") {
    todo.push("Watch for heat exhaustion or heat stroke signs and seek medical help immediately.");
    bring.push("Oral rehydration salts");
  }

  const smoky = input.usAqi !== null && input.usAqi > 100;
  if (input.usAqi !== null) {
    update.push(`Air quality index (US AQI) ${Math.round(input.usAqi)}${smoky ? " — unhealthy for sensitive groups or worse" : ""}.`);
  }
  if (smoky || (nearestKm !== null && nearestKm <= CLOSE_KM)) {
    todo.push("If smoke or haze is present, limit strenuous outdoor activity and keep windows closed.");
    bring.push("Face mask (N95 recommended for smoke)");
  }

  if (todo.length === 0) todo.push("No immediate action needed. Stay informed through official channels.");
  prepare.push("Emergency supplies if local authorities advise increased readiness");

  return { heatIndex, heat, nearbyCount: nearby.length, nearestKm, update, todo, bring, prepare };
}
