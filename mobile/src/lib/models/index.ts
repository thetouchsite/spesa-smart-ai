/**
 * Database-ready domain models.
 *
 * Forma dei dati persistiti. Oggi alimentano l'archivio locale del telefono;
 * sul backend corrispondono alle collezioni MongoDB di `server/src/db.ts`.
 *
 * Naming convention: snake_case columns for DB rows, camelCase for app
 * objects. The two are mapped by `src/lib/storage/*`.
 */

/** ISO-4217 currency code (e.g. "EUR", "JPY", "BRL"). */
export type Currency = string;
export type Frequency = "weekly" | "monthly";

export interface UserRecord {
  id: string;
  email?: string | null;
  display_name?: string | null;
  created_at: string;
}

export interface UserProfile {
  city: string;
  country: string;
  household: string;
  budget: string;
  currency: Currency;
  frequency: Frequency;
  style: string;
  allergies: string[];
  dislikes: string;
  zeroSpendDay: boolean;
}

export interface MealRecord {
  id: string;
  saved_plan_id: string;
  day: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  is_zero_spend: boolean;
}

export interface GroceryItemRecord {
  id: string;
  saved_plan_id: string;
  name: string;
  category: string;
  quantity: string;
  estimated_cost: number; // populated from price engine, never hardcoded
}

export interface IngredientPriceRecord {
  id: string;
  ingredient_name: string;
  category: string;
  unit: string;
  quantity: number;
  price: number;
  currency: Currency;
  city: string;
  country: string;
  source_id: string;
  confidence_score: number;
  recorded_at: string;
}

export interface SmartAlternativeRecord {
  id: string;
  from_ingredient: string;
  to_ingredient: string;
  nutrition_impact: "similar" | "better" | "lower";
}

export interface SupermarketRecord {
  id: string;
  name: string;
  country: string;
  /** Multiplier vs. baseline basket — replaced by live API data later. */
  baseline_multiplier: number;
}

export interface PriceSourceRecord {
  id: string;
  name: string;
  kind: "manual" | "external_api" | "web_import" | "provider";
  trust: number;
}
