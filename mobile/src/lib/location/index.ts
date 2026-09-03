/**
 * Location Engine — public surface.
 *
 * Exposes a single `locationProvider` that the rest of the app talks to.
 * The active provider is determined at module load from
 * `VITE_LOVABLE_LOCATION_PROVIDER` (defaulting to OSM) and can be swapped
 * at runtime via `setLocationProvider("google" | "apple" | "osm")` — the
 * UI never imports a specific backend.
 *
 * The "osm" backend is a composite that uses Nominatim for geocoding
 * + city search and Overpass for nearby-store discovery.
 */

import { nominatimProvider } from "./providers/nominatim";
import { overpassProvider } from "./providers/overpass";
import { googlePlacesProvider } from "./providers/google-places";
import { appleMapsProvider } from "./providers/apple-maps";
import {
  ProviderUnavailableError,
  type CityResult,
  type LatLon,
  type LocationProvider,
  type NearbySearchInput,
  type NearbyStore,
  type ReverseGeocodeResult,
} from "./providers/types";
import { withCache } from "./cache";

export type {
  CityResult,
  LatLon,
  LocationProvider,
  NearbyStore,
  NearbySearchInput,
  ReverseGeocodeResult,
  StoreCategory,
} from "./providers/types";

export type ProviderName = "osm" | "google" | "apple";

/** Composite OSM provider — Nominatim for geo, Overpass for POIs. */
const osmComposite: LocationProvider = {
  id: "osm",
  displayName: "OpenStreetMap",
  searchCities: (q, s) => nominatimProvider.searchCities(q, s),
  reverseGeocode: (p, s) => nominatimProvider.reverseGeocode(p, s),
  geocode: (q, s) => nominatimProvider.geocode(q, s),
  searchNearbyStores: (i, s) => overpassProvider.searchNearbyStores(i, s),
};

const REGISTRY: Record<ProviderName, LocationProvider> = {
  osm: osmComposite,
  google: googlePlacesProvider,
  apple: appleMapsProvider,
};

function envProvider(): ProviderName {
  // Nel prototipo arrivava da `import.meta.env` di Vite, che in React Native
  // non esiste. Qui la variabile è iniettata da Expo a build time.
  const v = process.env.EXPO_PUBLIC_LOCATION_PROVIDER || "osm";
  return v === "google" || v === "apple" ? v : "osm";
}

let active: ProviderName = envProvider();
let provider: LocationProvider = REGISTRY[active];

export function setLocationProvider(name: ProviderName): void {
  active = name;
  provider = REGISTRY[name];
}

export function getLocationProvider(): LocationProvider {
  return provider;
}

export function activeProviderName(): ProviderName {
  return active;
}

/* ─────────────────── Cached, fall-back-aware helpers ─────────────────── */

/** Run `fn` against the active provider, falling back to OSM on
 *  `ProviderUnavailableError`. UI code calls these helpers — never the
 *  provider directly — so swapping backends never breaks features. */
async function withFallback<T>(fn: (p: LocationProvider) => Promise<T>): Promise<T> {
  try {
    return await fn(provider);
  } catch (e) {
    if (e instanceof ProviderUnavailableError && provider !== osmComposite) {
      return fn(osmComposite);
    }
    throw e;
  }
}

export function searchCities(query: string, signal?: AbortSignal): Promise<CityResult[]> {
  const key = `loc:cities:${active}:${query.trim().toLowerCase()}`;
  return withCache(key, 10 * 60_000, () =>
    withFallback((p) => p.searchCities(query, signal)),
  );
}

export function reverseGeocode(point: LatLon): Promise<ReverseGeocodeResult | null> {
  const key = `loc:rev:${active}:${point.lat.toFixed(3)},${point.lon.toFixed(3)}`;
  return withCache(key, 10 * 60_000, () => withFallback((p) => p.reverseGeocode(point)));
}

export function geocode(query: string): Promise<CityResult | null> {
  const key = `loc:geo:${active}:${query.trim().toLowerCase()}`;
  return withCache(key, 30 * 60_000, () => withFallback((p) => p.geocode(query)));
}

export function searchNearbyStores(input: NearbySearchInput): Promise<NearbyStore[]> {
  const key =
    `loc:near:${active}:` +
    `${input.lat.toFixed(3)},${input.lon.toFixed(3)}:` +
    `${input.radiusM}:${(input.categories ?? []).join(",")}`;
  return withCache(key, 10 * 60_000, () => withFallback((p) => p.searchNearbyStores(input)));
}
