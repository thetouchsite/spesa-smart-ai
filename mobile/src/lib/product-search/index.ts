/**
 * Product Search Engine — orchestrator.
 *
 * For each grocery item runs providers in order:
 *   1. Google Shopping (SerpAPI, server-side)  → kind: "real"
 *   2. Amazon country search URL               → would be "real" if PA-API
 *                                                were configured; today acts
 *                                                as a fallback search link.
 *   3. In-market retailer search URL           → kind: "fallback-search"
 *   4. Manual price estimate from /price-data  → kind: "estimated"
 *
 * The orchestrator NEVER returns out-of-market retailers — `matchRetailerForCountry`
 * filters Google Shopping rows, and `retailersForCountry` scopes search-URL
 * fallbacks. The first provider to produce a usable row wins `primary`; the
 * manual estimate is always attached separately so the UI can show
 * "estimated vs online" side-by-side.
 */

import { defaultRetailerFor, retailersForCountry } from "@/lib/shopping-links";
import { matchRetailerForCountry } from "./retailer-match";
import { searchGoogleShopping, type SerpShoppingItem } from "./google-shopping.functions";
import type {
  ItemResults,
  ProductResult,
  SearchInput,
  SearchOutput,
} from "./types";

export type {
  ProductResult,
  ItemResults,
  SearchInput,
  SearchOutput,
  ProductKind,
  ProductSource,
} from "./types";

/* ────────────────────────────────────────────────────────────────────────── */

/** Amazon marketplace per country, for the country-aware search-URL fallback. */
const AMAZON_MARKETPLACE: Record<string, { host: string; name: string }> = {
  IT: { host: "amazon.it", name: "Amazon.it" },
  UK: { host: "amazon.co.uk", name: "Amazon UK" },
  DE: { host: "amazon.de", name: "Amazon.de" },
  FR: { host: "amazon.fr", name: "Amazon.fr" },
  ES: { host: "amazon.es", name: "Amazon.es" },
  US: { host: "amazon.com", name: "Amazon" },
  AE: { host: "amazon.ae", name: "Amazon.ae" },
};

import { normCountryLegacy } from "@/lib/country/legacy";

function normCountry(c: string): string {
  return normCountryLegacy(c) || "UK";
}

function amazonSearchUrl(query: string, country: string): { url: string; name: string; host: string } | null {
  const mk = AMAZON_MARKETPLACE[normCountry(country)];
  if (!mk) return null;
  return {
    url: `https://www.${mk.host}/s?k=${encodeURIComponent(query)}&i=amazonfresh`,
    name: mk.name,
    host: mk.host,
  };
}

/* ────────────────── Provider: Google Shopping (SerpAPI) ─────────────────── */

/** Reject generic homepage URLs ("https://tesco.com/", "https://amazon.it") —
 *  a "Buy Product" CTA pointing at a retailer homepage misleads the user that
 *  the displayed price refers to that landing page. Real PDP URLs always have
 *  a path with content (slug or numeric id). */
function isProductPageUrl(raw: string): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, "");
    // Path must have at least one segment with meaningful content.
    if (path.length < 2) return false;
    // Reject obvious search / category endpoints — those are search results,
    // not a product. We surface those as retailer-search fallbacks instead.
    if (/\/(search|s|recherche|ricerca|suche|buscar)(\/|$|\?)/i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Sanity-check a SerpAPI price against typical grocery-ingredient bounds.
 *  Items returned by Google Shopping occasionally include bulk/wholesale
 *  packs (€95 vinegar = 12-bottle case) or accessories that get matched to
 *  the query token-wise; treat anything well outside the per-item bound as
 *  unreliable and drop it. The basket-aggregate price still gets a separate
 *  per-line cap in `sanitizeEstimate`. */
function isPlausibleUnitPrice(price: number): boolean {
  return Number.isFinite(price) && price > 0.2 && price < 60;
}

/** Words that indicate the SerpAPI row is NOT the ingredient itself:
 *  appliances, books, pet food, wholesale/catering packs, gift baskets.
 *  Purchase-Link Reliability sprint — kills the "rice vinegar → rice cooker",
 *  "chickpeas → 25 kg catering sack", "chicken breast → pet food" class of
 *  mismatches before they reach the user. */
const TITLE_BLOCKLIST = [
  "cooker", "steamer", "kettle", "blender", "microwave", "appliance",
  "cookbook", "recipe book", "book", "ebook",
  "pet food", "dog food", "cat food", "for dogs", "for cats", "puppy", "kitten",
  "toy", "poster", "sticker", "candle", "seed", "seeds", "plant",
  "wholesale", "catering", "bulk", "case of", "carton of", "pallet",
  "gift basket", "hamper",
];

/** Meaningful content tokens from a grocery query — drops short stop-tokens
 *  ("of", "the") so "olive oil" → ["olive", "oil"] and "chicken breast" →
 *  ["chicken", "breast"]. */
function contentTokens(q: string): string[] {
  return q.toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

/** True when the SerpAPI title plausibly matches the ingredient query.
 *  Requires ALL content tokens from the query to appear in the title AND
 *  no blocklisted term. Strict on purpose — a false positive means a user
 *  clicks "Buy now" and lands on the wrong product. */
function titleMatchesQuery(title: string, query: string): boolean {
  const t = title.toLowerCase();
  if (TITLE_BLOCKLIST.some((bad) => t.includes(bad))) return false;
  const tokens = contentTokens(query);
  if (tokens.length === 0) return true;
  return tokens.every((tok) => t.includes(tok));
}

async function tryGoogleShopping(
  itemName: string,
  country: string,
  currency: string,
): Promise<{ primary: ProductResult | null; alternatives: ProductResult[] }> {
  let res: Awaited<ReturnType<typeof searchGoogleShopping>>;
  try {
    res = await searchGoogleShopping({ data: { query: itemName, country, limit: 6 } });
  } catch {
    return { primary: null, alternatives: [] };
  }
  if (!res.ok) return { primary: null, alternatives: [] };

  const inMarket = res.items
    .map((row: SerpShoppingItem) => {
      const match = matchRetailerForCountry(row.source, country);
      if (!match || row.price == null) return null;
      if (!isPlausibleUnitPrice(row.price)) return null;
      // Reject titles that don't share the ingredient's content tokens or
      // that hit the appliance/pet/wholesale blocklist. See titleMatchesQuery.
      if (!titleMatchesQuery(row.title || "", itemName)) return null;
      // Drop generic-homepage / search-page URLs — a "real" row MUST point at
      // an actual product page so price and link refer to the same item.
      const productLink = row.link && isProductPageUrl(row.link) ? row.link : null;
      if (!productLink) return null;
      const result: ProductResult = {
        itemName,
        productName: row.title || itemName,
        price: row.price,
        currency: row.currency || currency,
        retailer: match.retailer.name,
        retailerId: match.retailer.id,
        url: productLink,
        source: "google-shopping",
        confidence: 0.9,
        kind: "real",
      };
      return result;
    })
    .filter((x): x is ProductResult => x !== null);

  if (inMarket.length === 0) return { primary: null, alternatives: [] };
  // Cheapest in-market real result wins.
  inMarket.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return { primary: inMarket[0], alternatives: inMarket.slice(1) };
}

/* ────────────────── Provider: Amazon (search URL only) ──────────────────── */
/*
 * No PA-API credentials configured, so Amazon contributes a fallback-search
 * link only — never a "real" priced row. Wiring PA-API would mean swapping
 * this to a server function that returns price + ASIN and bumping `kind` to
 * "real" / `confidence` to ~0.85.
 */
function amazonFallback(itemName: string, country: string, currency: string): ProductResult | null {
  const mk = amazonSearchUrl(itemName, country);
  if (!mk) return null;
  return {
    itemName,
    productName: itemName,
    price: null,
    currency,
    retailer: mk.name,
    retailerId: "amazon-fresh",
    url: mk.url,
    source: "amazon",
    confidence: 0.45,
    kind: "fallback-search",
  };
}

/* ────────────────── Provider: In-market retailer search ─────────────────── */

function retailerSearchFallback(itemName: string, country: string, currency: string): ProductResult | null {
  const pool = retailersForCountry(country);
  const r = pool[0] ?? defaultRetailerFor(country);
  if (!r) return null;
  return {
    itemName,
    productName: itemName,
    price: null,
    currency,
    retailer: r.name,
    retailerId: r.id,
    url: r.searchUrl(itemName),
    source: "retailer-search",
    confidence: 0.4,
    kind: "fallback-search",
  };
}

/* ────────────────── Provider: Manual estimate ───────────────────────────── */

function manualEstimate(
  itemName: string,
  country: string,
  currency: string,
  estimatedByName: Map<string, number> | undefined,
): ProductResult | null {
  const price = estimatedByName?.get(itemName.toLowerCase());
  if (!price || price <= 0) return null;
  const r = retailersForCountry(country)[0] ?? defaultRetailerFor(country);
  return {
    itemName,
    productName: itemName,
    price: Math.round(price * 100) / 100,
    currency,
    retailer: r?.name ?? "Estimated average",
    retailerId: r?.id ?? "amazon-fresh",
    url: r ? r.searchUrl(itemName) : (amazonSearchUrl(itemName, country)?.url ?? `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(itemName)}`),
    source: "estimated",
    confidence: 0.55,
    kind: "estimated",
  };
}

/* ─────────────────────────── Orchestrator ───────────────────────────────── */

const CONCURRENCY = 4;

async function runWithLimit<T, R>(
  inputs: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(inputs.length);
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, inputs.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= inputs.length) return;
      out[i] = await worker(inputs[i]);
    }
  });
  await Promise.all(runners);
  return out;
}

export async function searchProducts(input: SearchInput): Promise<SearchOutput> {
  const { items, country, currency, estimatedByName } = input;

  const results = await runWithLimit(items, CONCURRENCY, async (it): Promise<ItemResults> => {
    const itemName = it.name;
    const estimate = manualEstimate(itemName, country, currency, estimatedByName);

    // 1. Google Shopping (real)
    const gs = await tryGoogleShopping(itemName, country, currency);
    if (gs.primary) {
      return { itemName, primary: gs.primary, estimate, alternatives: gs.alternatives };
    }

    // 2/3. Retailer search fallback (prefer in-market chain; Amazon comes after
    //      because Amazon Fresh availability per country is more variable).
    const retailer = retailerSearchFallback(itemName, country, currency);
    if (retailer) {
      return { itemName, primary: retailer, estimate, alternatives: [] };
    }
    const amazon = amazonFallback(itemName, country, currency);
    if (amazon) {
      return { itemName, primary: amazon, estimate, alternatives: [] };
    }

    // 4. Last-resort: surface the estimate as the primary record.
    if (estimate) return { itemName, primary: estimate, estimate, alternatives: [] };

    // No provider produced anything — synthesize a search row pointing at
    // Amazon's cross-market site so the user always has a Buy button.
    const az = amazonSearchUrl(itemName, country);
    return {
      itemName,
      primary: {
        itemName,
        productName: itemName,
        price: null,
        currency,
        retailer: az?.name ?? "Google Shopping",
        retailerId: "amazon-fresh",
        url: az?.url ?? `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(itemName)}`,
        source: "amazon",
        confidence: 0.3,
        kind: "fallback-search",
      },
      estimate: null,
      alternatives: [],
    };
  });

  const kindCounts: Record<ItemResults["primary"]["kind"], number> = {
    real: 0,
    "fallback-search": 0,
    estimated: 0,
  };
  for (const r of results) kindCounts[r.primary.kind] += 1;

  return {
    results,
    hasRealResults: kindCounts.real > 0,
    kindCounts,
    liveProviders: kindCounts.real > 0 ? ["google-shopping"] : [],
  };
}
