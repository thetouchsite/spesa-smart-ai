/**
 * Provider abstraction — every real or mock price source implements
 * this interface so the orchestrator can plug them in without changes.
 *
 * Add a new provider:
 *   1. Create a file in this directory exporting a `PriceProvider`.
 *   2. Register it in `src/lib/price-data/index.ts` (PROVIDERS array).
 *   3. Done — caching, fallback, dedup are handled centrally.
 */

import type { IngredientPrice } from "../types";

export interface PriceProvider {
  /** Stable id, used as a cache key prefix. */
  id: string;
  /** Human-readable name (logs / debug UI). */
  name: string;
  /** Priority — higher wins when two providers return the same ingredient. */
  priority: number;
  /** Fetch prices for a city / country pair. Return [] when unsupported. */
  fetchPrices(city: string, country: string): Promise<IngredientPrice[]>;
}
