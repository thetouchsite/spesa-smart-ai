/**
 * Overpass provider — nearby grocery / specialty food businesses from OSM.
 *
 * Maps OSM `shop=*` tags onto our `StoreCategory` enum. No API key, free,
 * but rate-limited; callers cache results by `(lat,lon,radius)` for 10
 * minutes via `src/lib/location/cache.ts`.
 */

import {
  type LocationProvider,
  type NearbySearchInput,
  type NearbyStore,
  type StoreCategory,
  haversineKm,
} from "./types";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

/** OSM `shop` tag value → our category. */
const SHOP_TAG_MAP: Record<string, StoreCategory> = {
  supermarket: "supermarket",
  convenience: "convenience",
  butcher: "butcher",
  seafood: "seafood",
  fishmonger: "seafood",
  bakery: "bakery",
  greengrocer: "greengrocer",
  organic: "organic",
  deli: "deli",
  farm: "farm",
  grocery: "grocery",
  general: "grocery",
};

const DEFAULT_SHOP_FILTER = Object.keys(SHOP_TAG_MAP).join("|");

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

function elementLatLon(el: OverpassElement): { lat: number; lon: number } | null {
  if (typeof el.lat === "number" && typeof el.lon === "number")
    return { lat: el.lat, lon: el.lon };
  if (el.center) return { lat: el.center.lat, lon: el.center.lon };
  return null;
}

function buildQuery(input: NearbySearchInput): string {
  const cats = input.categories?.length
    ? input.categories
        .map((c) => Object.keys(SHOP_TAG_MAP).find((k) => SHOP_TAG_MAP[k] === c) ?? c)
        .join("|")
    : DEFAULT_SHOP_FILTER;
  const around = `around:${Math.round(input.radiusM)},${input.lat},${input.lon}`;
  return (
    `[out:json][timeout:20];` +
    `(` +
    `nwr["shop"~"^(${cats})$"](${around});` +
    `);` +
    `out tags center 80;`
  );
}

async function fetchOverpass(body: string, signal?: AbortSignal): Promise<OverpassResponse> {
  let lastErr: unknown;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body,
        signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return (await res.json()) as OverpassResponse;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Overpass unavailable");
}

export const overpassProvider: LocationProvider = {
  id: "overpass",
  displayName: "OpenStreetMap (Overpass)",

  async searchCities() {
    return [];
  },
  async reverseGeocode() {
    return null;
  },
  async geocode() {
    return null;
  },

  async searchNearbyStores(input, signal) {
    const data = await fetchOverpass(buildQuery(input), signal);
    const center = { lat: input.lat, lon: input.lon };
    const rows: NearbyStore[] = [];
    for (const el of data.elements) {
      const pos = elementLatLon(el);
      const tags = el.tags ?? {};
      const shop = tags.shop ?? "";
      const category = SHOP_TAG_MAP[shop] ?? "other";
      const name = tags.name ?? tags["name:en"] ?? "Unnamed shop";
      if (!pos) continue;
      const distanceKm = haversineKm(center, pos);
      rows.push({
        id: `${el.type}/${el.id}`,
        name,
        category,
        lat: pos.lat,
        lon: pos.lon,
        distanceKm,
        address: [
          tags["addr:street"],
          tags["addr:housenumber"],
          tags["addr:city"],
          tags["addr:postcode"],
        ]
          .filter(Boolean)
          .join(" ") || undefined,
        phone: tags.phone ?? tags["contact:phone"],
        website: tags.website ?? tags["contact:website"],
        openingHours: tags.opening_hours,
        source: "overpass",
      });
    }
    rows.sort((a, b) => a.distanceKm - b.distanceKm);
    return rows.slice(0, input.limit ?? 60);
  },
};
