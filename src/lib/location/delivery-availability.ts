/**
 * Delivery provider availability — pure coverage matrix, no hardcoded
 * retailer list. Inputs are normalised country + city, outputs are the
 * subset of `RETAILERS` (delivery type) that operate at the location.
 *
 * The matrix is a best-effort approximation: provider websites still own
 * the authoritative "do you deliver to my address?" check, which only
 * happens at checkout. We never claim a delivery is guaranteed — the UI
 * surfaces these as "may deliver in your area".
 */

import { RETAILERS } from "@/lib/shopping-links/retailers";

type DeliveryProviderId =
  | "deliveroo"
  | "uber-eats"
  | "glovo"
  | "lieferando"
  | "wolt"
  | "instacart"
  | "amazon-fresh";

interface Coverage {
  /** ISO countries the provider operates in. */
  countries: string[];
  /** Optional city allow-list when coverage is metro-only. Lowercase. */
  cities?: string[];
}

const COVERAGE: Record<DeliveryProviderId, Coverage> = {
  deliveroo: { countries: ["UK", "IT", "FR", "ES", "AE"] },
  "uber-eats": { countries: ["UK", "FR", "ES", "US", "AE"] },
  glovo: { countries: ["IT", "ES", "FR", "DE"] },
  lieferando: { countries: ["DE"] },
  wolt: { countries: ["DE", "ES", "FR"] },
  instacart: { countries: ["US"] },
  "amazon-fresh": {
    countries: ["UK", "DE", "IT", "ES", "US"],
    // Amazon Fresh is metro-restricted in EU; cities here are an
    // approximation, not an SLA. Empty list = country-wide assumption.
    cities: [
      "london",
      "manchester",
      "birmingham",
      "berlin",
      "münchen",
      "munich",
      "hamburg",
      "milano",
      "milan",
      "roma",
      "rome",
      "madrid",
      "barcelona",
    ],
  },
};

import { normCountryLegacy } from "@/lib/country/legacy";

function normCountry(c: string): string {
  return normCountryLegacy(c) || "UK";
}

export interface AvailableDelivery {
  id: DeliveryProviderId;
  name: string;
  url: (query: string) => string;
}

export function deliveryProvidersFor(country: string, city?: string): AvailableDelivery[] {
  const cc = normCountry(country);
  const cityLc = (city ?? "").trim().toLowerCase();
  const out: AvailableDelivery[] = [];
  for (const [id, cov] of Object.entries(COVERAGE) as [DeliveryProviderId, Coverage][]) {
    if (!cov.countries.includes(cc)) continue;
    if (cov.cities && cityLc && !cov.cities.some((c) => cityLc.includes(c))) continue;
    const retailer = RETAILERS[id as keyof typeof RETAILERS];
    if (!retailer) continue;
    out.push({ id, name: retailer.name, url: (q) => retailer.searchUrl(q) });
  }
  return out;
}
