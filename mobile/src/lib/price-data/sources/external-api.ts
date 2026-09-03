/**
 * Source #2 — External Grocery API (STUB)
 *
 * Future home for supermarket / third-party price feeds, e.g.:
 *   • Tesco Grocery API
 *   • Sainsbury's product feed
 *   • Open Food Prices (https://prices.openfoodfacts.org)
 *   • Instacart, Amazon Fresh, regional aggregators
 *
 * Wiring guide when a provider is selected:
 *   1. Move this file's logic into a `createServerFn` so API keys read from
 *      `process.env.<PROVIDER>_API_KEY` stay server-side.
 *   2. Map the provider response to the shared `IngredientPrice` shape so
 *      no caller (Results page, API layer, scoring) needs to change.
 *   3. Return [] on failure — the API layer already falls back to the
 *      manual database.
 */

import type { IngredientPrice } from "../types";

export async function fetchExternalApiPrices(
  _city: string,
  _country: string,
): Promise<IngredientPrice[]> {
  // TODO: Connect a real supermarket API here. Until then, return nothing
  // so the API layer falls through to the manual database.
  return [];
}
