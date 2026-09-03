/**
 * Location Provider abstraction.
 *
 * All location-aware features (city search, forward/reverse geocoding,
 * nearby business discovery) talk to a `LocationProvider` — never directly
 * to Nominatim, Overpass, Google Places, or Apple MapKit. Swapping the
 * backend later (e.g. from OSM/Overpass to Google Places) is a one-line
 * change in `src/lib/location/index.ts`; UI and business logic stay put.
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export interface CityResult {
  /** Stable id from the upstream provider, used as React key. */
  id: string;
  /** Display city / town / village name. */
  name: string;
  /** ISO 3166-1 alpha-2 country code, uppercase. */
  countryCode: string;
  /** Country display name as returned by the provider. */
  country: string;
  /** Region / state / province if known. */
  region?: string;
  postcode?: string;
  lat: number;
  lon: number;
}

export type StoreCategory =
  | "supermarket"
  | "convenience"
  | "butcher"
  | "seafood"
  | "bakery"
  | "greengrocer"
  | "organic"
  | "deli"
  | "farm"
  | "grocery"
  | "other";

export interface NearbyStore {
  id: string;
  name: string;
  category: StoreCategory;
  lat: number;
  lon: number;
  distanceKm: number;
  address?: string;
  phone?: string;
  website?: string;
  openingHours?: string;
  /** Provider that produced this row — for debug/telemetry. */
  source: string;
}

export interface ReverseGeocodeResult {
  city: string;
  countryCode: string;
  country: string;
  region?: string;
  postcode?: string;
}

export interface NearbySearchInput extends LatLon {
  /** Radius in metres. */
  radiusM: number;
  /** Subset of categories to include; omit for "all groceries". */
  categories?: StoreCategory[];
  /** Soft cap on returned rows. */
  limit?: number;
}

/**
 * A LocationProvider is the single contract for all geographic lookups.
 * Implementations: Nominatim+Overpass (default, free), Google Places,
 * Apple MapKit. New providers must implement every method or throw a
 * typed `ProviderUnavailableError` so the orchestrator can fall back.
 */
export interface LocationProvider {
  readonly id: string;
  readonly displayName: string;

  searchCities(query: string, signal?: AbortSignal): Promise<CityResult[]>;
  reverseGeocode(point: LatLon, signal?: AbortSignal): Promise<ReverseGeocodeResult | null>;
  /** Forward geocode a free-text city/postcode/region into a single best match. */
  geocode(query: string, signal?: AbortSignal): Promise<CityResult | null>;
  searchNearbyStores(input: NearbySearchInput, signal?: AbortSignal): Promise<NearbyStore[]>;
}

export class ProviderUnavailableError extends Error {
  constructor(providerId: string, reason: string) {
    super(`Location provider "${providerId}" unavailable: ${reason}`);
    this.name = "ProviderUnavailableError";
  }
}

/** Haversine distance in kilometres. Shared by every provider. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
