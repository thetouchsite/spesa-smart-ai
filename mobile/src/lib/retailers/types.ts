/**
 * Retailer Registry — data shapes.
 *
 * These types describe the JSON schema under `./data/*.json`. Anything in
 * the JSON stays pure data; there is no business logic here.
 */

export type RetailerKind = "grocery" | "convenience" | "wholesale" | "specialty";

export interface Coverage {
  /** Lowercase city names the entry is available in. Empty / omitted = nationwide. */
  cities?: string[];
}

export interface RetailerEntry {
  id: string;
  name: string;
  kind: RetailerKind;
  /** Public web domains, used for match-back from search results. */
  domains?: string[];
  coverage?: Coverage;
  /** Cities where this retailer has known coverage gaps. */
  excludeCities?: string[];
}

export interface DeliveryEntry {
  id: string;
  /** Third-party provider (deliveroo, glovo, ubereats, wolt, everli, getir, rappi …). */
  provider: string;
  coverage?: Coverage;
  eta?: string;
}

export interface FreshInfo {
  cities: string[];
  eta: string;
}

export interface MarketplaceEntry {
  id: string;
  domain: string;
  /** Fresh-delivery info (if the marketplace runs Fresh in this country). */
  fresh?: FreshInfo;
  /** ETA for the nationwide marketplace (non-fresh basket). */
  marketplaceEta?: string;
}

export interface RetailerRegistry {
  /** ISO α-2 or `_default`. */
  country: string;
  retailers: RetailerEntry[];
  delivery: DeliveryEntry[];
  marketplaces: MarketplaceEntry[];
  /** Cities where NO quick-commerce / fresh delivery is available. */
  remoteExcludes?: string[];
}
