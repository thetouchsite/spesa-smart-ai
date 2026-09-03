/**
 * Google Places provider — pluggable, NOT active by default.
 *
 * Implements the same `LocationProvider` contract as Nominatim/Overpass so
 * the backend can be swapped without UI changes. Activation:
 *
 *   1. Link the `google_maps` connector (`standard_connectors--connect`).
 *   2. Set `VITE_LOVABLE_LOCATION_PROVIDER=google` (or call
 *      `setLocationProvider("google")`).
 *   3. Calls are routed through the Lovable Maps gateway so the API key
 *      never ships to the browser.
 *
 * Until then every method throws `ProviderUnavailableError`, which the
 * composite provider in `src/lib/location/index.ts` catches and falls back
 * to the OSM stack from.
 */

import {
  ProviderUnavailableError,
  type LocationProvider,
} from "./types";

const PROVIDER_ID = "google-places";

function unavailable(reason: string): never {
  throw new ProviderUnavailableError(PROVIDER_ID, reason);
}

export const googlePlacesProvider: LocationProvider = {
  id: PROVIDER_ID,
  displayName: "Google Places",

  async searchCities() {
    return unavailable("not wired — link google_maps connector and implement places:autocomplete");
  },
  async reverseGeocode() {
    return unavailable("not wired — call /maps/api/geocode/json via gateway");
  },
  async geocode() {
    return unavailable("not wired — call /maps/api/geocode/json via gateway");
  },
  async searchNearbyStores() {
    return unavailable("not wired — call /places/v1/places:searchNearby via gateway");
  },
};
