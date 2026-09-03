/**
 * GPS-first location resolution with graceful fallback.
 *
 *   1. Browser geolocation → reverse geocode via the active provider.
 *   2. Manual city / postcode / region → forward geocode.
 *
 * All geocoding goes through `src/lib/location` (provider abstraction) —
 * never directly to Nominatim / Google / Apple. Swapping backends is a
 * one-line change in the engine and does not touch this file.
 */

import { reverseGeocode, geocode, type CityResult } from "@/lib/location";

export interface ResolvedLocation {
  lat: number;
  lon: number;
  city: string;
  /** English country name from the resolver (empty when unknown). */
  country: string;
  /** ISO-3166 α-2, empty when unknown. */
  countryCode: string;
  region?: string;
  postcode?: string;
  /** ISO-4217, empty when unknown. Callers MUST handle the empty case
   *  (e.g. by asking the user to pick a country) rather than defaulting. */
  currency: string;
  source: "gps" | "manual";
}

import { resolveCountry } from "@/lib/country";

/** Build a ResolvedLocation from raw geocoder output. Never guesses a country
 *  — if the geocoder didn't return one we surface empty strings so the UI
 *  can prompt the user. */
function fromGeocoder(
  raw: {
    lat: number;
    lon: number;
    city: string;
    countryCode: string;
    region?: string;
    postcode?: string;
  },
  source: "gps" | "manual",
): ResolvedLocation {
  const profile = resolveCountry(raw.countryCode);
  return {
    lat: raw.lat,
    lon: raw.lon,
    city: raw.city,
    country: profile?.name ?? "",
    countryCode: profile?.code ?? "",
    region: raw.region,
    postcode: raw.postcode,
    currency: profile?.currency ?? "",
    source,
  };
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.geolocation;
}

export async function detectLocation(): Promise<ResolvedLocation | null> {
  if (!isGeolocationSupported()) return null;
  const pos = await new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  });
  if (!pos) return null;
  const { latitude: lat, longitude: lon } = pos.coords;
  const rev = await reverseGeocode({ lat, lon });
  if (!rev) return null;
  return fromGeocoder(
    {
      lat,
      lon,
      city: rev.city ?? "",
      countryCode: rev.countryCode ?? "",
      region: rev.region,
      postcode: rev.postcode,
    },
    "gps",
  );
}

/** Forward-resolve a free-text city / postcode / region into a location.
 *  Used when GPS is denied or unavailable. */
export async function resolveByText(query: string): Promise<ResolvedLocation | null> {
  const hit: CityResult | null = await geocode(query);
  if (!hit) return null;
  return fromGeocoder(
    {
      lat: hit.lat,
      lon: hit.lon,
      city: hit.name,
      countryCode: hit.countryCode,
      region: hit.region,
      postcode: hit.postcode,
    },
    "manual",
  );
}
