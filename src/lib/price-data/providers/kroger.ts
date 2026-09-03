/**
 * Kroger provider (STUB).
 * https://developer.kroger.com — OAuth2 + product/price endpoints.
 * Key secret: KROGER_CLIENT_ID / KROGER_CLIENT_SECRET.
 */

import type { PriceProvider } from "./types";

export const krogerProvider: PriceProvider = {
  id: "kroger",
  name: "Kroger API",
  priority: 80,
  async fetchPrices() {
    return [];
  },
};
