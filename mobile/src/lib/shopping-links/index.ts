/**
 * Shopping Link Engine — public surface.
 *
 * Builds `ShoppingLink` objects for individual grocery items and for a whole
 * basket. Today every link is a retailer SEARCH URL; the same API can later
 * return exact product URLs (with price/availability) without UI changes.
 *
 * NOTE: this engine is independent of, and complementary to, the Price Data
 * API (`src/lib/price-data`). Pricing answers "how much does this cost?";
 * the Shopping Link Engine answers "where can the user buy it?".
 */

import type { ShoppingLink } from "./types";
import {
  RETAILERS,
  RETAILER_LIST,
  defaultRetailerFor,
  retailersForCountry,
  type RetailerDef,
} from "./retailers";

export type { ShoppingLink, Retailer, Availability } from "./types";
export { RETAILERS, RETAILER_LIST, retailersForCountry, defaultRetailerFor } from "./retailers";

export interface BuildLinkInput {
  itemName: string;
  city?: string;
  country?: string;
  retailer?: RetailerDef;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function buildShoppingLink({
  itemName,
  city = "",
  country = "UK",
  retailer,
}: BuildLinkInput): ShoppingLink {
  const r = retailer ?? defaultRetailerFor(country);
  return {
    id: `${r.id}:${slug(itemName)}`,
    itemName,
    retailer: r.id,
    retailerName: r.name,
    city,
    country,
    productName: null,
    productUrl: r.productUrl(itemName),
    searchUrl: r.searchUrl(itemName),
    price: null,
    currency: null,
    availability: "unknown",
    confidenceScore: 0.4, // search-link only; product API will raise this.
    lastChecked: new Date().toISOString(),
  };
}

/** One link per item using the country's default retailer. */
export function buildShoppingLinksForList(
  items: { name: string }[],
  city = "",
  country = "UK",
): ShoppingLink[] {
  const r = defaultRetailerFor(country);
  return items.map((it) => buildShoppingLink({ itemName: it.name, city, country, retailer: r }));
}

/** "Shop this list" — one search URL per item, grouped by retailer. */
export function buildBasketSearchLinks(
  items: { name: string }[],
  country = "UK",
): Array<{ retailer: RetailerDef; links: ShoppingLink[] }> {
  return retailersForCountry(country).map((retailer) => ({
    retailer,
    links: items.map((it) =>
      buildShoppingLink({ itemName: it.name, country, retailer }),
    ),
  }));
}

/**
 * Build a single search URL that queries the whole basket on a retailer.
 * Retailers don't all support multi-term search well — for now we join the
 * top items with spaces, which most engines treat as OR-ish. Good enough to
 * land the user on a useful page; a per-item open-all flow is also exposed
 * via `buildBasketSearchLinks` for power users.
 */
export function buildBasketUrl(
  retailerId: keyof typeof RETAILERS,
  items: { name: string }[],
): string {
  const r = RETAILERS[retailerId];
  const top = items.slice(0, 8).map((i) => i.name).join(" ");
  return r.searchUrl(top || "groceries");
}
