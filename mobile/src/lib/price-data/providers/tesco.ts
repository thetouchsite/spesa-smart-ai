/**
 * Tesco provider (STUB).
 *
 * To connect:
 *   1. Obtain a Tesco Grocery API key. Store as TESCO_API_KEY secret.
 *   2. Spostare questo file dietro un endpoint del backend: la chiave resta li'.
 *   3. Map Tesco product nodes → IngredientPrice (category, unit, quantity, price).
 *   4. Return [] on auth / rate-limit failure — the orchestrator falls back.
 */

import type { PriceProvider } from "./types";

export const tescoProvider: PriceProvider = {
  id: "tesco",
  name: "Tesco Grocery API",
  priority: 90,
  async fetchPrices() {
    // TODO: wire real Tesco endpoint here.
    return [];
  },
};
