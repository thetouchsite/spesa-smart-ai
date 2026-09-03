/**
 * Price Data API — shared types
 *
 * IngredientPrice is the canonical price record across every source
 * (manual DB, external grocery APIs, CSV/web-scraped imports).
 * Adding a new source MUST return data conforming to this shape so the
 * Results page never needs to change when the backend evolves.
 */

export type SourceType =
  | "manual"
  | "external_api"
  | "web_import";

/**
 * ISO-4217 currency code. Kept as `string` so any of the world's ~180
 * currencies can flow through the pricing engine without a code change.
 * Historical name preserved for backward compatibility with existing imports.
 */
export type Currency = string;

export type IngredientCategory =
  | "Proteins"
  | "Vegetables"
  | "Carbohydrates"
  | "Healthy Fats"
  | "Fruit"
  | "Pantry"
  | "Other";

/**
 * Tier that produced a price. The resolver tries them in order and tags the
 * result so the UI can show transparency (city → country → region → global).
 */
export type ResolutionTier = "city" | "country" | "region" | "global" | "missing";

export interface IngredientPrice {
  id: string;
  ingredient_name: string;
  category: IngredientCategory;
  unit: "kg" | "g" | "l" | "ml" | "unit" | "pack";
  quantity: number;
  price: number;
  currency: Currency;
  /** City the row is valid for. Use "*" for the country-level baseline row. */
  city: string;
  country: string;
  supermarket: string | null;
  source_type: SourceType;
  source_url: string | null;
  last_updated: string;
  confidence_score: number;
}

export interface ShoppingListItem {
  name: string;
  category: IngredientCategory;
  quantity: string;
}

export interface PricedItem extends ShoppingListItem {
  matchedPrice: IngredientPrice | null;
  estimatedCost: number;
  confidence: number;
  resolutionTier: ResolutionTier;
  /** Number of purchasable packs/units needed, after ceil(required / pack). */
  packCount?: number;
  /** Quantity represented by one matched supermarket pack. */
  packQuantity?: string;
  /** Original recipe-driven quantity before pack rounding. */
  requiredQuantity?: string;
}

export interface PricingResult {
  items: PricedItem[];
  totalCost: number;
  currency: Currency;
  coverage: number;
  averageConfidence: number;
  /** Names of shopping list items that received no price at any tier. */
  missing: string[];
  /** Counts per resolution tier for transparency / debugging. */
  tierCounts: Record<ResolutionTier, number>;
}

export interface PriceAlternative {
  from: string;
  to: string;
  save: number;
  currency: Currency;
  nutritionImpact: "similar" | "better" | "lower";
}
