/**
 * Nominatim provider — OpenStreetMap-backed forward / reverse / city search.
 *
 * Free, no API key. Subject to the public usage policy (≤1 rps, identifying
 * Referer/UA). Implementations call it client-side and cache aggressively;
 * see `src/lib/location/cache.ts`.
 */

import type {
  CityResult,
  LatLon,
  LocationProvider,
  NearbyStore,
  NearbySearchInput,
  ReverseGeocodeResult,
} from "./types";

const NOMINATIM = "https://nominatim.openstreetmap.org";

interface NominatimSearchRow {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  type?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    hamlet?: string;
    county?: string;
    state?: string;
    region?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

function pickCityName(row: NominatimSearchRow): string {
  const a = row.address ?? {};
  return (
    a.city ||
    a.town ||
    a.village ||
    a.municipality ||
    a.hamlet ||
    row.name ||
    row.display_name.split(",")[0]
  );
}

function toCityResult(row: NominatimSearchRow): CityResult | null {
  const a = row.address ?? {};
  const name = pickCityName(row);
  const cc = (a.country_code || "").toUpperCase();
  if (!name || !cc) return null;
  return {
    id: String(row.place_id),
    name,
    country: a.country ?? cc,
    countryCode: cc,
    region: a.state ?? a.region ?? a.county,
    postcode: a.postcode,
    lat: Number(row.lat),
    lon: Number(row.lon),
  };
}

async function nomFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  // Combine caller signal with an 8s timeout so a hung request never
  // leaves the UI in a permanent "Searching…" state.
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), 8000);
  const onAbort = () => timeoutCtrl.abort();
  if (signal) {
    if (signal.aborted) timeoutCtrl.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const res = await fetch(`${NOMINATIM}${path}`, {
      headers: { Accept: "application/json" },
      signal: timeoutCtrl.signal,
    });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

export const nominatimProvider: LocationProvider = {
  id: "nominatim",
  displayName: "OpenStreetMap (Nominatim)",

  async searchCities(query, signal) {
    const q = (query || "").trim();
    if (q.length < 2) return [];
    const url =
      `/search?format=jsonv2&addressdetails=1&limit=8` +
      `&featuretype=settlement&q=${encodeURIComponent(q)}`;
    try {
      const rows = await nomFetch<NominatimSearchRow[]>(url, signal);
      if (!Array.isArray(rows)) return [];
      return rows.map(toCityResult).filter((x): x is CityResult => x !== null);
    } catch {
      return [];
    }
  },

  async reverseGeocode(point, signal): Promise<ReverseGeocodeResult | null> {
    try {
      const row = await nomFetch<NominatimSearchRow>(
        `/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lon}&zoom=12&addressdetails=1`,
        signal,
      );
      const a = row.address ?? {};
      const cc = (a.country_code || "").toUpperCase();
      const city = pickCityName(row);
      if (!cc) return null;
      return {
        city,
        countryCode: cc,
        country: a.country ?? cc,
        region: a.state ?? a.region ?? a.county,
        postcode: a.postcode,
      };
    } catch {
      return null;
    }
  },

  async geocode(query, signal) {
    const results = await this.searchCities(query, signal);
    return results[0] ?? null;
  },

  // Nominatim is not optimised for nearby-business search. The default
  // wiring delegates nearby discovery to the Overpass provider; this method
  // exists so callers that only have a Nominatim instance still get a sane
  // empty list rather than a crash.
  async searchNearbyStores(_input: NearbySearchInput): Promise<NearbyStore[]> {
    return [];
  },
};
