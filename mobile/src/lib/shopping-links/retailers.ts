/**
 * Retailer registry + search URL generators.
 *
 * Each retailer carries the metadata the Buy Online engine v2 needs to
 * prioritise it:
 *   - `kind`: marketplace (Amazon-like), delivery (Deliveroo/Glovo/…), or
 *     supermarket. Marketplaces and delivery apps outrank supermarkets in
 *     the recommendation order.
 *   - `etaLabel`: rough delivery ETA shown to the user.
 *   - `excludeCities` / `regionCities`: coverage guards. Regional chains such
 *     as Esselunga (northern Italy only) are excluded for southern cities
 *     (Naples, Palermo, Bari, …) so we never recommend a retailer the user
 *     cannot actually order from.
 *
 * Country codes: "IT", "UK", "DE", "FR", "ES", "US", "AE". `retailersForCountry`
 * returns ONLY retailers that operate in that country — no global fallback to
 * UK chains.
 */

import type { Retailer } from "./types";

export type RetailerKind = "marketplace" | "delivery" | "supermarket";

export interface RetailerDef {
  id: Retailer;
  name: string;
  /** Country codes the retailer operates in. */
  countries: string[];
  searchUrl: (query: string) => string;
  productUrl: (query: string) => string | null;
  /** Business model — drives Buy Online priority ordering. */
  kind: RetailerKind;
  /** Human-readable delivery ETA shown in the UI. */
  etaLabel: string;
  /** Lowercase city names where the retailer does NOT deliver (regional gaps). */
  excludeCities?: string[];
  /** Lowercase city names the retailer serves exclusively (empty = nationwide). */
  regionCities?: string[];
}

const enc = (q: string) => encodeURIComponent(q.trim());

// ─── Regional coverage constants ─────────────────────────────────────
// Esselunga: physical stores only in Lombardia, Piemonte, Emilia-Romagna,
// Toscana, Veneto, Liguria, Lazio. No delivery in the South / islands.
const ESSELUNGA_EXCLUDES = [
  "napoli", "naples", "salerno", "caserta", "avellino", "benevento",
  "bari", "taranto", "lecce", "foggia", "brindisi",
  "palermo", "catania", "messina", "siracusa", "trapani",
  "cagliari", "sassari", "olbia",
  "reggio calabria", "cosenza", "catanzaro", "crotone",
  "potenza", "matera",
  "campobasso", "l'aquila", "pescara",
];

// Small tourist / island areas where quick-commerce delivery apps
// (Deliveroo, Glovo, Uber Eats grocery, Everli, Wolt, Amazon Fresh) do NOT
// operate. Users in these areas should see nationwide Amazon marketplace +
// nearby-store options only, never a delivery CTA that fails at checkout.
const REMOTE_TOURIST_EXCLUDES = [
  "porto cervo", "costa smeralda", "san pantaleo", "arzachena",
  "capri", "anacapri",
  "positano", "amalfi", "ravello", "praiano",
  "ischia", "procida",
  "portofino", "portovenere",
  "taormina",
  "pantelleria", "lampedusa", "linosa",
];

// Metro allow-list for Amazon Fresh in the EU (approximation, not an SLA).
const AMAZON_FRESH_METROS = [
  "london", "manchester", "birmingham", "liverpool", "leeds", "glasgow",
  "berlin", "munich", "münchen", "hamburg", "frankfurt", "köln", "cologne",
  "milano", "milan", "roma", "rome", "bologna", "torino", "turin",
  "madrid", "barcelona", "valencia", "sevilla",
  "paris", "lyon", "marseille",
];

export const RETAILERS: Record<Retailer, RetailerDef> = {
  // ─── UK ────────────────────────────────────────────────────────────
  tesco: {
    id: "tesco", name: "Tesco", countries: ["UK"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${enc(q)}`,
    productUrl: () => null,
  },
  asda: {
    id: "asda", name: "Asda", countries: ["UK"], kind: "supermarket",
    etaLabel: "Next day",
    searchUrl: (q) => `https://groceries.asda.com/search/${enc(q)}`,
    productUrl: () => null,
  },
  sainsburys: {
    id: "sainsburys", name: "Sainsbury's", countries: ["UK"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${enc(q)}`,
    productUrl: () => null,
  },
  morrisons: {
    id: "morrisons", name: "Morrisons", countries: ["UK"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://groceries.morrisons.com/search?entry=${enc(q)}`,
    productUrl: () => null,
  },
  "aldi-uk": {
    id: "aldi-uk", name: "Aldi UK", countries: ["UK"], kind: "supermarket",
    etaLabel: "Next day",
    searchUrl: (q) => `https://groceries.aldi.co.uk/en-GB/Search?keywords=${enc(q)}`,
    productUrl: () => null,
  },
  "lidl-uk": {
    id: "lidl-uk", name: "Lidl UK", countries: ["UK"], kind: "supermarket",
    etaLabel: "In-store only",
    searchUrl: (q) => `https://www.lidl.co.uk/search?q=${enc(q)}`,
    productUrl: () => null,
  },

  // ─── Italy ─────────────────────────────────────────────────────────
  esselunga: {
    id: "esselunga", name: "Esselunga", countries: ["IT"], kind: "supermarket",
    etaLabel: "Same or next day",
    excludeCities: ESSELUNGA_EXCLUDES,
    searchUrl: (q) => `https://www.esselungaacasa.it/ecommerce/nav/search/products.html?q=${enc(q)}`,
    productUrl: () => null,
  },
  conad: {
    id: "conad", name: "Conad", countries: ["IT"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://spesaonline.conad.it/spesa-online/it/search?text=${enc(q)}`,
    productUrl: () => null,
  },
  coop: {
    id: "coop", name: "Coop", countries: ["IT"], kind: "supermarket",
    etaLabel: "Next day",
    searchUrl: (q) => `https://www.coopshop.it/search?query=${enc(q)}`,
    productUrl: () => null,
  },
  "carrefour-it": {
    id: "carrefour-it", name: "Carrefour Italia", countries: ["IT"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://www.carrefour.it/spesa-online/search?q=${enc(q)}`,
    productUrl: () => null,
  },
  "lidl-it": {
    id: "lidl-it", name: "Lidl Italia", countries: ["IT"], kind: "supermarket",
    etaLabel: "In-store only",
    searchUrl: (q) => `https://www.lidl.it/q/query/${enc(q)}`,
    productUrl: () => null,
  },
  eurospin: {
    id: "eurospin", name: "Eurospin", countries: ["IT"], kind: "supermarket",
    etaLabel: "In-store only",
    searchUrl: (q) => `https://www.eurospin.it/ricerca/?q=${enc(q)}`,
    productUrl: () => null,
  },
  md: {
    id: "md", name: "MD", countries: ["IT"], kind: "supermarket",
    etaLabel: "In-store only",
    searchUrl: (q) => `https://www.mdspa.it/ricerca?q=${enc(q)}`,
    productUrl: () => null,
  },
  penny: {
    id: "penny", name: "Penny", countries: ["IT"], kind: "supermarket",
    etaLabel: "In-store only",
    searchUrl: (q) => `https://www.penny.it/ricerca?q=${enc(q)}`,
    productUrl: () => null,
  },

  // ─── Germany ───────────────────────────────────────────────────────
  aldi: {
    id: "aldi", name: "Aldi", countries: ["DE"], kind: "supermarket",
    etaLabel: "In-store only",
    searchUrl: (q) => `https://www.aldi-sued.de/de/suche.html?query=${enc(q)}`,
    productUrl: () => null,
  },
  lidl: {
    id: "lidl", name: "Lidl", countries: ["DE"], kind: "supermarket",
    etaLabel: "In-store only",
    searchUrl: (q) => `https://www.lidl.de/q/query/${enc(q)}`,
    productUrl: () => null,
  },
  rewe: {
    id: "rewe", name: "Rewe", countries: ["DE"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://shop.rewe.de/productList?search=${enc(q)}`,
    productUrl: () => null,
  },
  edeka: {
    id: "edeka", name: "Edeka", countries: ["DE"], kind: "supermarket",
    etaLabel: "Next day",
    searchUrl: (q) => `https://www.edeka.de/eh/suche.jsp?search=${enc(q)}`,
    productUrl: () => null,
  },
  kaufland: {
    id: "kaufland", name: "Kaufland", countries: ["DE"], kind: "supermarket",
    etaLabel: "Next day",
    searchUrl: (q) => `https://www.kaufland.de/s/?search_value=${enc(q)}`,
    productUrl: () => null,
  },

  // ─── France ────────────────────────────────────────────────────────
  carrefour: {
    id: "carrefour", name: "Carrefour", countries: ["FR"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://www.carrefour.fr/s?q=${enc(q)}`,
    productUrl: () => null,
  },
  auchan: {
    id: "auchan", name: "Auchan", countries: ["FR"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://www.auchan.fr/recherche?text=${enc(q)}`,
    productUrl: () => null,
  },
  leclerc: {
    id: "leclerc", name: "Leclerc", countries: ["FR"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://www.leclercdrive.fr/recherche?q=${enc(q)}`,
    productUrl: () => null,
  },
  intermarche: {
    id: "intermarche", name: "Intermarché", countries: ["FR"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://www.intermarche.com/recherche?q=${enc(q)}`,
    productUrl: () => null,
  },

  // ─── Spain ─────────────────────────────────────────────────────────
  mercadona: {
    id: "mercadona", name: "Mercadona", countries: ["ES"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://tienda.mercadona.es/search-results?query=${enc(q)}`,
    productUrl: () => null,
  },
  "carrefour-es": {
    id: "carrefour-es", name: "Carrefour España", countries: ["ES"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://www.carrefour.es/supermercado/search?keyword=${enc(q)}`,
    productUrl: () => null,
  },
  "lidl-es": {
    id: "lidl-es", name: "Lidl España", countries: ["ES"], kind: "supermarket",
    etaLabel: "In-store only",
    searchUrl: (q) => `https://www.lidl.es/q/query/${enc(q)}`,
    productUrl: () => null,
  },
  dia: {
    id: "dia", name: "Dia", countries: ["ES"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://www.dia.es/search?text=${enc(q)}`,
    productUrl: () => null,
  },

  // ─── USA ───────────────────────────────────────────────────────────
  walmart: {
    id: "walmart", name: "Walmart", countries: ["US"], kind: "supermarket",
    etaLabel: "Same day",
    searchUrl: (q) => `https://www.walmart.com/search?q=${enc(q)}`,
    productUrl: () => null,
  },
  target: {
    id: "target", name: "Target", countries: ["US"], kind: "supermarket",
    etaLabel: "Same day",
    searchUrl: (q) => `https://www.target.com/s?searchTerm=${enc(q)}`,
    productUrl: () => null,
  },
  kroger: {
    id: "kroger", name: "Kroger", countries: ["US"], kind: "supermarket",
    etaLabel: "Same or next day",
    searchUrl: (q) => `https://www.kroger.com/search?query=${enc(q)}`,
    productUrl: () => null,
  },
  "whole-foods": {
    id: "whole-foods", name: "Whole Foods", countries: ["US"], kind: "supermarket",
    etaLabel: "Same day (Prime)",
    searchUrl: (q) => `https://www.amazon.com/s?k=${enc(q)}&i=wholefoods`,
    productUrl: () => null,
  },

  // ─── Marketplaces (highest priority for Buy Online) ───────────────
  // Amazon Fresh is metro-only in the EU/UK. Regular Amazon.xx marketplace
  // remains available nationwide via the `amazonSearchUrl` helper — this
  // registry entry only powers the "Fresh" (1-2h grocery) option.
  "amazon-fresh": {
    id: "amazon-fresh", name: "Amazon Fresh",
    countries: ["UK", "US", "DE", "IT", "ES", "FR"],
    kind: "marketplace",
    etaLabel: "Same day (Prime)",
    regionCities: AMAZON_FRESH_METROS,
    searchUrl: (q) => `https://www.amazon.com/s?k=${enc(q)}&i=amazonfresh`,
    productUrl: () => null,
  },

  // ─── Delivery platforms (2nd priority) ────────────────────────────
  // All quick-commerce delivery apps share the same remote-area gap: they
  // do not serve small islands or resort towns (Porto Cervo, Capri,
  // Positano, Ischia, …). Hide them there so we never surface a CTA that
  // fails at checkout with "no couriers in your area".
  deliveroo: {
    id: "deliveroo", name: "Deliveroo",
    countries: ["UK", "IT", "FR", "AE"],
    kind: "delivery",
    etaLabel: "30–60 min",
    excludeCities: REMOTE_TOURIST_EXCLUDES,
    searchUrl: (q) => `https://deliveroo.com/search?query=${enc(q)}`,
    productUrl: () => null,
  },
  "uber-eats": {
    id: "uber-eats", name: "Uber Eats",
    countries: ["UK", "IT", "FR", "ES", "US", "AE", "DE"],
    kind: "delivery",
    etaLabel: "30–60 min",
    excludeCities: REMOTE_TOURIST_EXCLUDES,
    searchUrl: (q) => `https://www.ubereats.com/search?q=${enc(q)}`,
    productUrl: () => null,
  },
  "just-eat-grocery": {
    id: "just-eat-grocery", name: "Just Eat Groceries",
    countries: ["UK", "IT", "ES", "FR", "DE"],
    kind: "delivery",
    etaLabel: "30–60 min",
    excludeCities: REMOTE_TOURIST_EXCLUDES,
    searchUrl: (q) => `https://www.just-eat.co.uk/search/${enc(q)}`,
    productUrl: () => null,
  },
  glovo: {
    id: "glovo", name: "Glovo",
    countries: ["IT", "ES", "FR"],
    kind: "delivery",
    etaLabel: "30–60 min",
    excludeCities: REMOTE_TOURIST_EXCLUDES,
    searchUrl: (q) => `https://glovoapp.com/en/search/?query=${enc(q)}`,
    productUrl: () => null,
  },
  everli: {
    id: "everli", name: "Everli",
    countries: ["IT", "FR"],
    kind: "delivery",
    etaLabel: "Same day",
    excludeCities: REMOTE_TOURIST_EXCLUDES,
    searchUrl: (q) => `https://it.everli.com/it/search/?q=${enc(q)}`,
    productUrl: () => null,
  },
  lieferando: {
    id: "lieferando", name: "Lieferando",
    countries: ["DE"], kind: "delivery",
    etaLabel: "30–60 min",
    excludeCities: REMOTE_TOURIST_EXCLUDES,
    searchUrl: (q) => `https://www.lieferando.de/lieferservice/essen/${enc(q)}`,
    productUrl: () => null,
  },
  wolt: {
    id: "wolt", name: "Wolt",
    countries: ["DE", "ES", "FR"],
    kind: "delivery",
    etaLabel: "30–60 min",
    excludeCities: REMOTE_TOURIST_EXCLUDES,
    searchUrl: (q) => `https://wolt.com/en/search?q=${enc(q)}`,
    productUrl: () => null,
  },
  instacart: {
    id: "instacart", name: "Instacart",
    countries: ["US"], kind: "delivery",
    etaLabel: "Same day",
    excludeCities: REMOTE_TOURIST_EXCLUDES,
    searchUrl: (q) => `https://www.instacart.com/store/s?k=${enc(q)}`,
    productUrl: () => null,
  },
};


export const RETAILER_LIST: RetailerDef[] = Object.values(RETAILERS);

/**
 * Retailers operating in the given country. Returns an empty list when no
 * retailer is registered — callers MUST handle the empty case rather than
 * fall back to retailers from another country.
 */
import { normCountryLegacy } from "@/lib/country/legacy";

export function retailersForCountry(country: string): RetailerDef[] {
  const c = normCountryLegacy(country);
  if (!c) return [];
  return RETAILER_LIST.filter((r) => r.countries.includes(c));
}

/**
 * Does the retailer actually deliver to `city`? Uses `excludeCities` /
 * `regionCities` metadata. Missing city = permissive (assume yes) so we
 * don't hide valid options when the user hasn't set a city.
 */
export function retailerServesCity(r: RetailerDef, city: string): boolean {
  const c = (city || "").trim().toLowerCase();
  if (!c) return true;
  if (r.regionCities && r.regionCities.length > 0) {
    return r.regionCities.some((rc) => c.includes(rc));
  }
  if (r.excludeCities && r.excludeCities.some((ec) => c.includes(ec))) {
    return false;
  }
  return true;
}

/** Default retailer for a country — prefers a marketplace/delivery option
 *  (which reflect Buy Online v2 priorities) over a supermarket chain. */
export function defaultRetailerFor(country: string): RetailerDef {
  const list = retailersForCountry(country);
  return (
    list.find((r) => r.kind === "marketplace") ??
    list.find((r) => r.kind === "delivery") ??
    list[0] ??
    RETAILERS["amazon-fresh"]
  );
}
