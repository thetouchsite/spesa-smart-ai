/**
 * Web scraper provider (STUB).
 * For partners / supermarkets without a public API. Always run server-side,
 * respect robots.txt and rate limits. Tag with source_type: "web_import".
 */

import type { PriceProvider } from "./types";

export const scraperProvider: PriceProvider = {
  id: "scraper",
  name: "Web Scraper",
  priority: 50,
  async fetchPrices() {
    return [];
  },
};
