// Worldwide place search via Photon (komoot): OpenStreetMap-based, built for type-ahead, free, CORS-enabled.
// Unlike a populated-places index, it returns real admin areas — "Texas" is the US state, "Bukidnon" the
// province — each with its OSM id, so the exact border of what was picked can be looked up.
export interface GuidePlace {
  name: string;
  region: string;
  lat: number;
  lng: number;
  osm?: string; // e.g. "R48393" (relation) — the exact area picked from search
  kind?: string; // e.g. "Province", "City", "Country"
}

export const DEFAULT_PLACE: GuidePlace = {
  name: "Malaybalay City",
  region: "Bukidnon, Philippines",
  lat: 8.1575,
  lng: 125.1278,
};

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    type?: string; // country | state | county | city | district | locality …
    osm_type?: "N" | "W" | "R";
    osm_id?: number;
    osm_key?: string; // place | boundary | …
    osm_value?: string; // city | town | village | state | administrative …
    countrycode?: string;
    country?: string;
    state?: string;
    county?: string;
    city?: string;
  };
}

const PLACE_LABEL: Record<string, string> = {
  country: "Country",
  region: "Region",
  state: "State",
  province: "Province",
  county: "County",
  municipality: "Municipality",
  city: "City",
  town: "Town",
  village: "Village",
  hamlet: "Hamlet",
  suburb: "Suburb",
  quarter: "Quarter",
  neighbourhood: "Neighbourhood",
  district: "District",
};

/** Human label for a search result, e.g. Bukidnon → "Province" (PH provinces are tagged state in OSM). */
export function placeKind(p: PhotonFeature["properties"]): string {
  const raw = p.osm_key === "place" ? p.osm_value : p.type;
  if (raw === "state" && p.countrycode?.toLowerCase() === "ph") return "Province";
  if (raw === "village" && p.countrycode?.toLowerCase() === "ph") return "Barangay";
  return PLACE_LABEL[raw ?? ""] ?? "Place";
}

export async function searchPlaces(query: string): Promise<GuidePlace[]> {
  const layers = ["country", "state", "county", "city", "district", "locality"].map((l) => `&layer=${l}`).join("");
  const res = await fetch(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query.trim())}&limit=10&lang=en${layers}`,
  );
  if (!res.ok) throw new Error(`place search ${res.status}`);
  const body = (await res.json()) as { features?: PhotonFeature[] };
  return (body.features ?? [])
    // Only places and administrative areas — not shops, estates, power plants with the same name.
    .filter((f) => f.properties.name && (f.properties.osm_key === "place" || f.properties.osm_key === "boundary"))
    .slice(0, 6)
    .map((f) => {
      const p = f.properties;
      const kind = placeKind(p);
      const parents = [p.city, p.county, p.state, p.country].filter((x, i, a) => x && x !== p.name && a.indexOf(x) === i);
      return {
        name: p.name!,
        region: [kind, ...parents.slice(-2)].join(" · "),
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        osm: p.osm_type && p.osm_id ? `${p.osm_type}${p.osm_id}` : undefined,
        kind,
      };
    });
}

// Shared React Query key so the map and the action guide reuse one FIRMS request per place.
export const firmsKey = (place: GuidePlace | null) =>
  place ? ["firms-hotspots", place.lat, place.lng] : ["firms-hotspots"];
