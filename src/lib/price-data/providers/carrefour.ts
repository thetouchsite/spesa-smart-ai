/**
 * Carrefour provider (STUB).
 * Connect to Carrefour's product feed / partner API when available.
 * Key secret: CARREFOUR_API_KEY.
 */

import type { PriceProvider } from "./types";

export const carrefourProvider: PriceProvider = {
  id: "carrefour",
  name: "Carrefour API",
  priority: 85,
  async fetchPrices() {
    return [];
  },
};
