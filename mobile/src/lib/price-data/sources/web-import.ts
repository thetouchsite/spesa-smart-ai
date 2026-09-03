/**
 * Source #3 — Web Scraping / Data Import (STUB)
 *
 * Future home for batch-imported prices:
 *   • CSV uploads from partners
 *   • Scheduled scrapers (run server-side, never in the browser)
 *   • Crowd-sourced submissions
 *
 * Wiring guide when this lands:
 *   1. Persistere le righe importate in una collezione `ingredient_prices`
 *      using the `IngredientPrice` schema verbatim.
 *   2. Sostituire questo stub con un endpoint del backend che la interroga,
 *      filtered by `city` / `country`.
 *   3. Tag every imported row with `source_type: "web_import"` and a
 *      `confidence_score` reflecting how recent / verified the data is.
 */

import type { IngredientPrice } from "../types";

export async function fetchWebImportPrices(
  _city: string,
  _country: string,
): Promise<IngredientPrice[]> {
  // TODO: Query the imported-prices table here.
  return [];
}
