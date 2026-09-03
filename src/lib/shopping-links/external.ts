/**
 * Cross-market fallback URL builders for the Online Purchase Flow.
 *
 * Country lookups go through the Global Country Resolver + Retailer
 * Registry — no per-file COUNTRY_ALIAS table, no silent UK fallback.
 * Callers pass any country identifier; unresolvable countries fall back
 * to global amazon.com / non-localised Google Shopping (telemetry logs
 * the miss so we can add data for the missing country).
 */

import { resolveCountry } from "@/lib/country";
import { loadRegistry } from "@/lib/retailers/registry";
import { trackFallbackUsage } from "@/lib/telemetry/global";

const enc = (q: string) => encodeURIComponent((q || "").trim());

export function googleShoppingUrl(query: string, country?: string | null): string {
  const profile = resolveCountry(country);
  if (!profile) {
    trackFallbackUsage({ where: "google-shopping-url", from: String(country ?? ""), to: "generic" });
    return `https://www.google.com/search?tbm=shop&q=${enc(query)}`;
  }
  // gl = country code (α-2 lowercase), hl = UI language.
  return `https://www.google.com/search?tbm=shop&q=${enc(query)}&gl=${profile.code.toLowerCase()}&hl=${profile.language}`;
}

export function amazonSearchUrl(query: string, country?: string | null): string {
  const reg = loadRegistry(country);
  const amazon = reg.marketplaces.find((m) => m.domain.startsWith("amazon."));
  const host = amazon?.domain ?? "amazon.com";
  if (!amazon) {
    trackFallbackUsage({ where: "amazon-search-url", from: String(country ?? ""), to: "amazon.com" });
  }
  return `https://www.${host}/s?k=${enc(query)}`;
}
