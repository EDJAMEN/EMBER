// Worldwide place search (Open-Meteo geocoding: free, no key, CORS-enabled).
export interface GuidePlace {
  name: string;
  region: string;
  lat: number;
  lng: number;
}

export const DEFAULT_PLACE: GuidePlace = {
  name: "Malaybalay City",
  region: "Bukidnon, Philippines",
  lat: 8.1575,
  lng: 125.1278,
};

export async function searchPlaces(query: string): Promise<GuidePlace[]> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`,
  );
  if (!res.ok) throw new Error(`geocoding ${res.status}`);
  const body = (await res.json()) as {
    results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[];
  };
  return (body.results ?? []).map((r) => ({
    name: r.name,
    region: [r.admin1, r.country].filter(Boolean).join(", "),
    lat: r.latitude,
    lng: r.longitude,
  }));
}

// Shared React Query key so the map and the action guide reuse one FIRMS request per place.
export const firmsKey = (place: GuidePlace | null) =>
  place ? ["firms-hotspots", place.lat, place.lng] : ["firms-hotspots"];
