/**
 * Source #3 — Web Scraping / Data Import (STUB)
 *
 * Future home for batch-imported prices:
 *   • CSV uploads from partners
 *   • Scheduled scrapers (run server-side, never in the browser)
 *   • Crowd-sourced submissions
 *
 * Wiring guide when this lands:
 *   1. Persist imported rows in a `ingredient_prices` table (Lovable Cloud)
 *      using the `IngredientPrice` schema verbatim.
 *   2. Replace this stub with a `createServerFn` that queries that table,
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
