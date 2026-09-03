/**
 * Walmart provider (STUB).
 * Connect via Walmart Open API (affiliates) or Walmart IO.
 * Key secret: WALMART_API_KEY.
 */

import type { PriceProvider } from "./types";

export const walmartProvider: PriceProvider = {
  id: "walmart",
  name: "Walmart API",
  priority: 80,
  async fetchPrices() {
    return [];
  },
};
