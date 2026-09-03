/**
 * Smart Supermarket Comparison — MVP mock layer.
 *
 * Computes an estimated basket cost for the user's grocery list at each
 * supermarket using a per-store multiplier applied to the live basket.
 *
 * IMPORTANT: results are scoped to the user's country. An Italian user must
 * never see Tesco / Sainsbury's / Asda or any other out-of-market chain. If
 * no profile is registered for a country, the comparison returns an empty
 * list (UI must hide the section) rather than falling back to UK stores.
 */

export interface SupermarketBasket {
  id: string;
  name: string;
  country: string[];
  /** Estimated basket cost at this store, in the user's currency. */
  total: number;
  /** Δ vs. the cheapest option in the comparison set. */
  savingsVsMax: number;
  isCheapest: boolean;
}

interface SupermarketProfile {
  id: string;
  name: string;
  country: string[];
  /** Cost multiplier applied to the user's live basket total. */
  multiplier: number;
}

// Mock multipliers calibrated so discounters beat the major chains.
// TODO: replace each entry with a real price provider per chain.
const PROFILES: SupermarketProfile[] = [
  // Italy
  { id: "esselunga",    name: "Esselunga",        country: ["IT"], multiplier: 1.02 },
  { id: "conad",        name: "Conad",            country: ["IT"], multiplier: 0.98 },
  { id: "coop",         name: "Coop",             country: ["IT"], multiplier: 1.00 },
  { id: "carrefour-it", name: "Carrefour Italia", country: ["IT"], multiplier: 1.04 },
  { id: "lidl-it",      name: "Lidl Italia",      country: ["IT"], multiplier: 0.88 },
  { id: "eurospin",     name: "Eurospin",         country: ["IT"], multiplier: 0.84 },
  { id: "md",           name: "MD",               country: ["IT"], multiplier: 0.85 },
  { id: "penny",        name: "Penny",            country: ["IT"], multiplier: 0.87 },
  { id: "amazon-fresh-it", name: "Amazon Fresh",  country: ["IT"], multiplier: 1.05 },

  // UK
  { id: "tesco",      name: "Tesco",       country: ["UK"], multiplier: 1.00 },
  { id: "asda",       name: "Asda",        country: ["UK"], multiplier: 0.96 },
  { id: "sainsburys", name: "Sainsbury's", country: ["UK"], multiplier: 1.02 },
  { id: "morrisons",  name: "Morrisons",   country: ["UK"], multiplier: 0.98 },
  { id: "aldi-uk",    name: "Aldi UK",     country: ["UK"], multiplier: 0.85 },
  { id: "lidl-uk",    name: "Lidl UK",     country: ["UK"], multiplier: 0.86 },

  // Germany
  { id: "aldi-de",  name: "Aldi",     country: ["DE"], multiplier: 0.86 },
  { id: "lidl-de",  name: "Lidl",     country: ["DE"], multiplier: 0.88 },
  { id: "rewe",     name: "Rewe",     country: ["DE"], multiplier: 1.02 },
  { id: "edeka",    name: "Edeka",    country: ["DE"], multiplier: 1.05 },
  { id: "kaufland", name: "Kaufland", country: ["DE"], multiplier: 0.92 },

  // France
  { id: "carrefour",   name: "Carrefour",   country: ["FR"], multiplier: 1.02 },
  { id: "auchan",      name: "Auchan",      country: ["FR"], multiplier: 1.00 },
  { id: "leclerc",     name: "Leclerc",     country: ["FR"], multiplier: 0.95 },
  { id: "intermarche", name: "Intermarché", country: ["FR"], multiplier: 0.97 },

  // Spain
  { id: "mercadona",    name: "Mercadona",        country: ["ES"], multiplier: 0.94 },
  { id: "carrefour-es", name: "Carrefour España", country: ["ES"], multiplier: 1.02 },
  { id: "lidl-es",      name: "Lidl España",      country: ["ES"], multiplier: 0.88 },
  { id: "dia",          name: "Dia",              country: ["ES"], multiplier: 0.90 },

  // USA
  { id: "walmart",     name: "Walmart",      country: ["US"], multiplier: 0.95 },
  { id: "kroger",      name: "Kroger",       country: ["US"], multiplier: 1.00 },
  { id: "target",      name: "Target",       country: ["US"], multiplier: 1.02 },
  { id: "whole-foods", name: "Whole Foods",  country: ["US"], multiplier: 1.20 },
  { id: "amazon-fresh-us", name: "Amazon Fresh", country: ["US"], multiplier: 1.04 },
];


import { normCountryLegacy } from "@/lib/country/legacy";

function normCountry(country: string): string {
  return normCountryLegacy(country);
}

export function compareSupermarkets(
  basketTotal: number,
  country: string,
): SupermarketBasket[] {
  if (basketTotal <= 0) return [];
  const code = normCountry(country);
  const pool = PROFILES.filter((p) => p.country.includes(code));
  // No global fallback — out-of-market chains would mislead the user.
  if (pool.length === 0) return [];
  const totals = pool.map((p) => ({
    profile: p,
    total: Math.round(basketTotal * p.multiplier * 100) / 100,
  }));
  const min = Math.min(...totals.map((t) => t.total));
  const max = Math.max(...totals.map((t) => t.total));
  return totals
    .map(({ profile, total }) => ({
      id: profile.id,
      name: profile.name,
      country: profile.country,
      total,
      savingsVsMax: Math.round((max - total) * 100) / 100,
      isCheapest: total === min,
    }))
    .sort((a, b) => a.total - b.total);
}
