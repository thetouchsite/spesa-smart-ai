/**
 * Apple Maps (MapKit JS) provider — pluggable, NOT active by default.
 *
 * Same `LocationProvider` contract as the other backends. Apple MapKit JS
 * requires a developer-issued JWT minted from a private key; until that
 * token is configured every method throws `ProviderUnavailableError` and
 * the composite provider falls back to OSM.
 *
 * Activation outline (not implemented):
 *   1. Generate a MapKit JS private key in Apple Developer.
 *   2. Mint a JWT server-side via a TanStack server function.
 *   3. Implement `searchCities` via `mapkit.Search`, `searchNearbyStores`
 *      via `mapkit.PointsOfInterestSearch` filtered to grocery categories.
 */

import {
  ProviderUnavailableError,
  type LocationProvider,
} from "./types";

const PROVIDER_ID = "apple-maps";

function unavailable(reason: string): never {
  throw new ProviderUnavailableError(PROVIDER_ID, reason);
}

export const appleMapsProvider: LocationProvider = {
  id: PROVIDER_ID,
  displayName: "Apple Maps (MapKit JS)",

  async searchCities() {
    return unavailable("not wired — requires MapKit JS JWT");
  },
  async reverseGeocode() {
    return unavailable("not wired — requires MapKit JS JWT");
  },
  async geocode() {
    return unavailable("not wired — requires MapKit JS JWT");
  },
  async searchNearbyStores() {
    return unavailable("not wired — requires MapKit JS JWT");
  },
};
