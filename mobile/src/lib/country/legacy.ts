/**
 * Legacy country-code compat shim.
 *
 * Historical retailer definitions (shopping-links/retailers.ts,
 * price-data/supermarkets.ts, product-search, …) key their `countries`
 * arrays by "UK" rather than the ISO-3166 "GB". Until every registry
 * migrates to α-2, this helper lets any caller normalise a free-form
 * country string via the Global Country Resolver AND keep parity with
 * the legacy "UK" key.
 *
 * New code should call `toIsoAlpha2` directly — never re-introduce a
 * per-file COUNTRY_ALIAS table.
 */

import { toIsoAlpha2 } from "@/lib/country";

export function normCountryLegacy(country: string | null | undefined): string {
  const iso = toIsoAlpha2(country);
  if (!iso) return "";
  return iso === "GB" ? "UK" : iso;
}
