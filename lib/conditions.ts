// Current weather + air quality for a point (Open-Meteo: free, no key, CORS-enabled).
import { maxHeatIndex } from "./heat-grid";
export interface Conditions {
  tempC: number | null;
  humidity: number | null;
  windKmh: number | null;
  usAqi: number | null;
  maxHeatIndexC: number | null; // today's peak, from hourly temperature + humidity
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function fetchConditions(lat: number, lng: number): Promise<Conditions> {
  const [weather, air] = await Promise.allSettled([
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m&forecast_days=1&timezone=auto`,
    ).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`weather ${r.status}`)))),
    fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&current=us_aqi`).then((r) =>
      r.ok ? r.json() : Promise.reject(new Error(`air ${r.status}`)),
    ),
  ]);
  const hourly = weather.status === "fulfilled" ? weather.value.hourly : null;
  const w = weather.status === "fulfilled" ? weather.value.current : null;
  const a = air.status === "fulfilled" ? air.value.current : null;
  return {
    tempC: num(w?.temperature_2m),
    humidity: num(w?.relative_humidity_2m),
    windKmh: num(w?.wind_speed_10m),
    usAqi: num(a?.us_aqi),
    maxHeatIndexC: maxHeatIndex(hourly?.temperature_2m ?? [], hourly?.relative_humidity_2m ?? []),
  };
}

// Shared React Query key so the map's temperature card and the action guide reuse one request.
export const conditionsKey = (lat: number, lng: number) => ["conditions", lat, lng];
