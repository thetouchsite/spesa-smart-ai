/**
 * Product Search Engine — shared types.
 *
 * Separates three concerns the UI must distinguish:
 *   - "real"            real online result with price + product URL
 *   - "fallback-search" no product result, but a retailer search URL to open
 *   - "estimated"       no online result; price from the manual averages DB
 *
 * Providers run in order (real first) and tag every record so the UI can
 * group, badge and confidence-score them consistently.
 */

export type ProductSource =
  | "google-shopping"
  | "amazon"
  | "retailer-search"
  | "estimated";

export type ProductKind = "real" | "fallback-search" | "estimated";

export interface ProductResult {
  /** Original grocery list item name (the query). */
  itemName: string;
  /** Title returned by the provider (or item name when none). */
  productName: string;
  /** Per-unit price as displayed by the provider; null when unavailable. */
  price: number | null;
  /** ISO currency code. */
  currency: string;
  /** Human-readable retailer name. */
  retailer: string;
  /** Stable retailer ID (matches RETAILERS registry when known). */
  retailerId: string;
  /** Direct product URL when available, otherwise a retailer search URL. */
  url: string;
  source: ProductSource;
  /** 0..1 confidence in this row's price/availability. */
  confidence: number;
  kind: ProductKind;
}

export interface ItemResults {
  itemName: string;
  /** Primary record shown in the list — best provider that returned. */
  primary: ProductResult;
  /** Manual-DB estimate, when known, surfaced as a reference. */
  estimate: ProductResult | null;
  /** All raw rows (real online results) when more than one was returned. */
  alternatives: ProductResult[];
}

export interface SearchInput {
  items: { name: string }[];
  city: string;
  country: string;
  currency: string;
  /** Lowercased item name → estimated per-unit cost from the price engine. */
  estimatedByName?: Map<string, number>;
}

export interface SearchOutput {
  results: ItemResults[];
  /** True when at least one provider returned a real online result. */
  hasRealResults: boolean;
  /** Counts per kind for the transparency footer. */
  kindCounts: Record<ProductKind, number>;
  /** Active live providers ("google-shopping" only today). */
  liveProviders: ProductSource[];
}
