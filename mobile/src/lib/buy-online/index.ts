/**
 * Buy Online Engine v2.
 *
 * Mission: "the fastest and easiest way for the user to buy today's grocery
 * basket online, right now." Ranking priority:
 *
 *   1. Online marketplaces available in the user's country
 *      (Amazon / Amazon Fresh, Deliveroo, Glovo, Uber Eats Grocery,
 *       Just Eat Groceries, Everli, Wolt, Instacart, Lieferando).
 *   2. Supermarket chains with verified online ordering and delivery in
 *      the user's city (regional-coverage chains such as Esselunga are
 *      excluded for cities they do not serve — Naples, Palermo, …).
 *   3. Local grocery stores with online ordering.
 *   4. Physical nearby stores only when no online option exists
 *      (surfaced by the Nearby Stores screen, not here).
 *
 * Out-of-market retailers are never returned. Chains with regional-only
 * coverage are filtered per-city via `retailerServesCity`.
 */

import {
  RETAILERS,
  retailersForCountry,
  retailerServesCity,
  type RetailerDef,
} from "@/lib/shopping-links/retailers";
import { googleShoppingUrl, amazonSearchUrl } from "@/lib/shopping-links/external";
import type { ItemResults } from "@/lib/product-search/types";

export type BuyOnlineSourceType =
  | "direct_product_url"
  | "retailer_search_url"
  | "google_shopping"
  | "amazon_search"
  | "delivery_search"
  | "estimated_fallback";

export type BuyOnlineRetailerType =
  | "amazon"
  | "supermarket"
  | "delivery"
  | "marketplace"
  | "estimate";

export type Availability = "unknown" | "in_stock" | "out_of_stock";

export interface BuyOnlineResult {
  itemName: string;
  normalizedItemName: string;
  quantity: string | null;
  unit: string | null;
  retailer: string;
  retailerId: string;
  retailerType: BuyOnlineRetailerType;
  country: string;
  city: string;
  price: number | null;
  currency: string;
  sourceType: BuyOnlineSourceType;
  productUrl: string | null;
  searchUrl: string;
  basketUrl: string | null;
  confidenceScore: number;
  availability: Availability;
  deliveryAvailable: boolean;
  /** Human-readable ETA (e.g. "30–60 min", "Same day"). */
  etaLabel: string | null;
  lastChecked: string;
}

export interface BasketProvider {
  id: string;
  name: string;
  type: BuyOnlineRetailerType;
  url: string;
  /** true when the URL is a real basket; false when it is a multi-item search. */
  isDirectBasket: boolean;
  etaLabel: string | null;
  deliveryAvailable: boolean;
  /** Sort priority — lower = higher on screen. */
  priority: number;
  /** Estimated basket cost when available (informational, from grocery list). */
  estimatedBasketCost?: number | null;
  currency?: string;
}

/* ─────────────────────────── Helpers ─────────────────────────────────── */

import { normCountryLegacy } from "@/lib/country/legacy";

function normCountry(country: string): string {
  // Preserve legacy behaviour: unknown / empty country degrades to "UK"
  // so existing retailer selectors don't crash. New callers should
  // instead pass through resolver-produced α-2 and handle null.
  return normCountryLegacy(country) || "UK";
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

function splitQuantity(q: string): { quantity: string | null; unit: string | null } {
  if (!q) return { quantity: null, unit: null };
  const m = q.match(/^([\d.,/\s]+)\s*([a-zA-Z]+)?/);
  if (!m) return { quantity: q, unit: null };
  return { quantity: m[1].trim(), unit: (m[2] || "").trim() || null };
}

const AMAZON_RETAILER: Record<string, string> = {
  IT: "Amazon.it",
  UK: "Amazon UK",
  DE: "Amazon.de",
  FR: "Amazon.fr",
  ES: "Amazon.es",
  US: "Amazon",
  AE: "Amazon.ae",
};

const AMAZON_ETA: Record<string, string> = {
  IT: "Same day (Prime)",
  UK: "Same day (Prime)",
  DE: "Same day (Prime)",
  FR: "Same day (Prime)",
  ES: "Same day (Prime)",
  US: "Same day (Prime)",
  AE: "Next day",
};

function retailerType(r: RetailerDef): BuyOnlineRetailerType {
  if (r.id.startsWith("amazon")) return "amazon";
  if (r.kind === "delivery") return "delivery";
  if (r.kind === "marketplace") return "marketplace";
  return "supermarket";
}

function priorityFor(type: BuyOnlineRetailerType): number {
  switch (type) {
    case "amazon": return 0;
    case "marketplace": return 1;
    case "delivery": return 2;
    case "supermarket": return 3;
    case "estimate": return 9;
  }
}

/** In-city, in-country online-capable retailers grouped by kind. */
function marketplacesFor(country: string, city: string): RetailerDef[] {
  return retailersForCountry(country)
    .filter((r) => r.kind === "marketplace" && r.id !== "amazon-fresh")
    .filter((r) => retailerServesCity(r, city));
}
function deliveryFor(country: string, city: string): RetailerDef[] {
  return retailersForCountry(country)
    .filter((r) => r.kind === "delivery")
    .filter((r) => retailerServesCity(r, city));
}
function onlineSupermarketsFor(country: string, city: string): RetailerDef[] {
  return retailersForCountry(country)
    .filter((r) => r.kind === "supermarket" && r.etaLabel !== "In-store only")
    .filter((r) => retailerServesCity(r, city));
}
function inStoreOnlyFor(country: string, city: string): RetailerDef[] {
  return retailersForCountry(country)
    .filter((r) => r.kind === "supermarket" && r.etaLabel === "In-store only")
    .filter((r) => retailerServesCity(r, city));
}

/* ─────────────── Per-item Buy Options ────────────────────────────────── */

interface BuildOptionsInput {
  itemName: string;
  quantity?: string;
  country: string;
  city?: string;
  currency: string;
  product?: ItemResults | null;
  estimatedPrice?: number | null;
}

export function buildBuyOptions(input: BuildOptionsInput): BuyOnlineResult[] {
  const country = normCountry(input.country);
  const city = input.city ?? "";
  const { quantity, unit } = splitQuantity(input.quantity ?? "");
  const now = new Date().toISOString();
  const norm = normalize(input.itemName);
  const out: BuyOnlineResult[] = [];

  const base = (
    overrides: Partial<BuyOnlineResult> & Pick<BuyOnlineResult, "retailer" | "retailerId" | "sourceType" | "searchUrl" | "confidenceScore">,
  ): BuyOnlineResult => ({
    itemName: input.itemName,
    normalizedItemName: norm,
    quantity,
    unit,
    country,
    city,
    price: null,
    currency: input.currency,
    productUrl: null,
    basketUrl: null,
    availability: "unknown",
    deliveryAvailable: false,
    etaLabel: null,
    lastChecked: now,
    retailerType: "supermarket",
    ...overrides,
  });

  // 1. Direct product URL from live provider.
  const lookupRetailer = (id: string): RetailerDef | undefined =>
    (RETAILERS as Record<string, RetailerDef>)[id];
  const isDeliveryCapable = (def: RetailerDef | undefined): boolean =>
    !!def && (def.kind !== "supermarket" || def.etaLabel !== "In-store only");

  const primary = input.product?.primary;
  if (primary && primary.kind === "real") {
    const def = lookupRetailer(primary.retailerId);
    out.push(base({
      retailer: primary.retailer,
      retailerId: primary.retailerId,
      retailerType: def ? retailerType(def) : "supermarket",
      sourceType: "direct_product_url",
      productUrl: primary.url,
      searchUrl: primary.url,
      price: primary.price,
      confidenceScore: primary.confidence ?? 0.9,
      availability: "in_stock",
      etaLabel: def?.etaLabel ?? null,
      deliveryAvailable: isDeliveryCapable(def),
    }));
  }
  for (const alt of input.product?.alternatives ?? []) {
    const def = lookupRetailer(alt.retailerId);
    out.push(base({
      retailer: alt.retailer,
      retailerId: alt.retailerId,
      retailerType: def ? retailerType(def) : "supermarket",
      sourceType: "direct_product_url",
      productUrl: alt.url,
      searchUrl: alt.url,
      price: alt.price,
      confidenceScore: alt.confidence ?? 0.75,
      availability: "in_stock",
      etaLabel: def?.etaLabel ?? null,
      deliveryAvailable: isDeliveryCapable(def),
    }));
  }

  // 2. Amazon country marketplace — top marketplace pick.
  out.push(base({
    retailer: AMAZON_RETAILER[country] ?? "Amazon",
    retailerId: "amazon-fresh",
    retailerType: "amazon",
    sourceType: "amazon_search",
    searchUrl: amazonSearchUrl(input.itemName, country),
    confidenceScore: 0.6,
    deliveryAvailable: true,
    etaLabel: AMAZON_ETA[country] ?? "Next day",
  }));

  // 3. Delivery platforms (Deliveroo, Glovo, Uber Eats, Just Eat, Everli, …).
  for (const r of deliveryFor(country, city)) {
    out.push(base({
      retailer: r.name,
      retailerId: r.id,
      retailerType: "delivery",
      sourceType: "delivery_search",
      searchUrl: r.searchUrl(input.itemName),
      confidenceScore: 0.55,
      deliveryAvailable: true,
      etaLabel: r.etaLabel,
    }));
  }

  // 4. Supermarkets with online delivery, city-filtered.
  for (const r of onlineSupermarketsFor(country, city)) {
    out.push(base({
      retailer: r.name,
      retailerId: r.id,
      retailerType: "supermarket",
      sourceType: "retailer_search_url",
      searchUrl: r.searchUrl(input.itemName),
      productUrl: r.productUrl(input.itemName),
      confidenceScore: 0.45,
      deliveryAvailable: true,
      etaLabel: r.etaLabel,
    }));
  }

  // 5. Google Shopping SERP — cross-market discovery.
  out.push(base({
    retailer: "Google Shopping",
    retailerId: "google-shopping",
    retailerType: "marketplace",
    sourceType: "google_shopping",
    searchUrl: googleShoppingUrl(input.itemName, country),
    confidenceScore: 0.35,
    etaLabel: null,
  }));

  // 6. In-store-only chains (last-resort — no online delivery in this city).
  for (const r of inStoreOnlyFor(country, city)) {
    out.push(base({
      retailer: r.name,
      retailerId: r.id,
      retailerType: "supermarket",
      sourceType: "retailer_search_url",
      searchUrl: r.searchUrl(input.itemName),
      productUrl: r.productUrl(input.itemName),
      confidenceScore: 0.25,
      deliveryAvailable: false,
      etaLabel: r.etaLabel,
    }));
  }

  // 7. Estimated fallback (informational, no buy link).
  if (input.estimatedPrice != null && input.estimatedPrice > 0) {
    out.push(base({
      retailer: "Estimated average",
      retailerId: "estimated",
      retailerType: "estimate",
      sourceType: "estimated_fallback",
      searchUrl: googleShoppingUrl(input.itemName, country),
      price: Math.round(input.estimatedPrice * 100) / 100,
      confidenceScore: 0.2,
    }));
  }

  // Stable sort: by priority group, then by confidence desc.
  return out.sort((a, b) => {
    const pa = priorityFor(a.retailerType);
    const pb = priorityFor(b.retailerType);
    if (pa !== pb) return pa - pb;
    return b.confidenceScore - a.confidenceScore;
  });
}

/** Cheapest option whose `price` is known. */
export function cheapestOption(options: BuyOnlineResult[]): BuyOnlineResult | null {
  const priced = options.filter((o) => typeof o.price === "number" && (o.price as number) > 0 && o.sourceType !== "estimated_fallback");
  if (priced.length === 0) return null;
  return priced.reduce((best, cur) => ((cur.price ?? Infinity) < (best.price ?? Infinity) ? cur : best));
}

/** Fastest realistic delivery option — prefers 30-60 min delivery apps. */
export function fastestDeliveryOption(options: BuyOnlineResult[]): BuyOnlineResult | null {
  const delivery = options.filter((o) => o.deliveryAvailable);
  if (delivery.length === 0) return null;
  const rank = (o: BuyOnlineResult): number => {
    const eta = (o.etaLabel || "").toLowerCase();
    if (eta.includes("min")) return 0;
    if (eta.includes("same day")) return 1;
    if (eta.includes("next day")) return 2;
    return 3;
  };
  return [...delivery].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/* ─────────────── Basket-level providers ──────────────────────────────── */

function multiSearchQuery(items: { name: string }[]): string {
  return items.slice(0, 8).map((i) => i.name).join(" ") || "groceries";
}

/**
 * Build the ordered "Buy This Shopping List Online" providers for a
 * country + city, applying Buy Online v2 priorities.
 */
export function buildBasketProviders(
  items: { name: string }[],
  country: string,
  city = "",
  estimatedBasketCost: number | null = null,
  currency = "",
): BasketProvider[] {
  const c = normCountry(country);
  const query = multiSearchQuery(items);
  const providers: BasketProvider[] = [];

  // 1. Amazon country marketplace — nationwide, always available. Uses the
  //    regular Amazon.xx storefront (NOT Amazon Fresh), so ETA is the country
  //    Prime default ("Next day"). Amazon Fresh's same-day metro delivery is
  //    surfaced separately per-item via the amazon-fresh registry entry,
  //    which is city-gated by `retailerServesCity`.
  const freshDef = (RETAILERS as Record<string, RetailerDef>)["amazon-fresh"];
  const freshAvailable = !!freshDef && retailerServesCity(freshDef, city) && freshDef.countries.includes(c);
  providers.push({
    id: "amazon-fresh",
    name: AMAZON_RETAILER[c] ?? "Amazon",
    type: "amazon",
    url: amazonSearchUrl(query, c),
    isDirectBasket: false,
    etaLabel: freshAvailable ? (AMAZON_ETA[c] ?? "Next day") : "Next day",
    deliveryAvailable: true,
    priority: priorityFor("amazon"),
    estimatedBasketCost,
    currency,
  });

  // 2. Delivery marketplaces (Deliveroo, Glovo, Uber Eats, Just Eat, Everli, …)
  for (const r of deliveryFor(c, city)) {
    providers.push({
      id: r.id,
      name: r.name,
      type: "delivery",
      url: r.searchUrl(query),
      isDirectBasket: false,
      etaLabel: r.etaLabel,
      deliveryAvailable: true,
      priority: priorityFor("delivery"),
      estimatedBasketCost,
      currency,
    });
  }

  // 3. Supermarkets with online delivery (city-filtered).
  for (const r of onlineSupermarketsFor(c, city)) {
    providers.push({
      id: r.id,
      name: r.name,
      type: "supermarket",
      url: r.searchUrl(query),
      isDirectBasket: false,
      etaLabel: r.etaLabel,
      deliveryAvailable: true,
      priority: priorityFor("supermarket"),
      estimatedBasketCost,
      currency,
    });
  }

  // In-store-only supermarkets are intentionally omitted from the basket
  // section: this section is "Buy online". They surface in the Nearby Stores
  // screen instead.

  return providers.sort((a, b) => a.priority - b.priority);
}

export { RETAILERS };
