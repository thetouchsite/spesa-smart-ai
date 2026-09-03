/**
 * CSV import provider (STUB).
 * Reads from a periodically refreshed CSV (partner feed, internal export).
 * When wired: parse CSV server-side, normalise rows into IngredientPrice,
 * tag with source_type: "web_import".
 */

import type { PriceProvider } from "./types";

export const csvImportProvider: PriceProvider = {
  id: "csv-import",
  name: "CSV Import",
  priority: 70,
  async fetchPrices() {
    return [];
  },
};
