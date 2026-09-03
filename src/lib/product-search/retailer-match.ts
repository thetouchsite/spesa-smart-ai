/**
 * Maps Google Shopping `source` strings (e.g. "Esselunga", "tesco.com",
 * "Carrefour Italia") to our retailer registry, and exposes a strict
 * country → allowed-retailer-name lookup so SerpAPI results from out-of-market
 * stores (e.g. Tesco for an Italian user) are discarded.
 */

import { RETAILER_LIST, retailersForCountry } from "@/lib/shopping-links";
import type { RetailerDef } from "@/lib/shopping-links/retailers";

/** Normalize a free-text source string ("Tesco UK · tesco.com") for matching. */
function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Extra aliases per retailer for hostnames / brand variants. */
const ALIASES: Record<string, string[]> = {
  tesco: ["tesco com", "tesco co uk", "tesco groceries"],
  asda: ["asda com", "asda groceries"],
  sainsburys: ["sainsburys co uk", "sainsbury s", "sainsburys"],
  morrisons: ["morrisons com", "morrisons groceries"],
  esselunga: ["esselungaacasa", "esselunga it"],
  conad: ["spesaonline conad", "conad it"],
  coop: ["coopshop", "coop it"],
  "carrefour-it": ["carrefour it", "carrefour italia"],
  "lidl-it": ["lidl it", "lidl italia"],
  eurospin: ["eurospin it"],
  md: ["mdspa", "md spa", "md discount"],
  penny: ["penny market", "penny it"],
  aldi: ["aldi de", "aldi sued", "aldi nord"],
  lidl: ["lidl de", "lidl"],
  rewe: ["rewe de", "shop rewe"],
  edeka: ["edeka de"],
  carrefour: ["carrefour fr"],
  auchan: ["auchan fr"],
  leclerc: ["leclerc drive", "leclercdrive", "e leclerc"],
  mercadona: ["mercadona es", "tienda mercadona"],
  "amazon-fresh": ["amazon fresh", "amazon"],
};

export interface RetailerMatch {
  retailer: RetailerDef;
  score: number;
}

/**
 * Find the retailer registered for `country` whose name/aliases best match
 * the provider's source string. Returns null when no in-market retailer
 * matches — caller MUST discard the row in that case.
 */
export function matchRetailerForCountry(
  source: string,
  country: string,
): RetailerMatch | null {
  const pool = retailersForCountry(country);
  if (pool.length === 0) return null;
  const target = norm(source);
  if (!target) return null;
  let best: RetailerMatch | null = null;
  for (const r of pool) {
    const candidates = [norm(r.name), norm(r.id), ...(ALIASES[r.id] ?? []).map(norm)];
    for (const cand of candidates) {
      if (!cand) continue;
      const score = target.includes(cand) || cand.includes(target) ? cand.length : 0;
      if (score > 0 && (!best || score > best.score)) {
        best = { retailer: r, score };
      }
    }
  }
  return best;
}

/** Look up a retailer (any country) by name; used for non-country-restricted matching. */
export function matchAnyRetailer(source: string): RetailerDef | null {
  const target = norm(source);
  if (!target) return null;
  for (const r of RETAILER_LIST) {
    const candidates = [norm(r.name), norm(r.id), ...(ALIASES[r.id] ?? []).map(norm)];
    if (candidates.some((c) => c && (target.includes(c) || c.includes(target)))) {
      return r;
    }
  }
  return null;
}
