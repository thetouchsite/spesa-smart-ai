/**
 * Open Food Facts / Open Prices provider (STUB).
 * https://prices.openfoodfacts.org — community-sourced, public, no key required.
 * Good multi-country baseline for when commercial APIs aren't available.
 */

import type { PriceProvider } from "./types";

export const openFoodFactsProvider: PriceProvider = {
  id: "open-food-facts",
  name: "Open Food Facts (Open Prices)",
  priority: 60,
  async fetchPrices() {
    return [];
  },
};
