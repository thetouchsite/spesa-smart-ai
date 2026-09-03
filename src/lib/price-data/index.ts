/**
 * Price Data API — public surface
 *
 * The Results page (and any future scoring / budgeting logic) MUST go
 * through this module. Internals — manual DB today, supermarket APIs
 * tomorrow — can evolve without touching the UI.
 *
 * Fallback hierarchy applied by the resolver, per ingredient:
 *   1. Exact city match           (resolutionTier: "city")
 *   2. Country average            (resolutionTier: "country")
 *   3. Region average (EU/NA/...) (resolutionTier: "region")
 *   4. Global average             (resolutionTier: "global")
 *   5. No match                   (resolutionTier: "missing")
 *
 * Cross-tier averages are currency-converted into the user's country
 * currency via a static FX table, so a US user querying an EU-only item
 * still receives USD. The provider registry (real supermarket APIs) is
 * unchanged — providers return `IngredientPrice[]` tagged with the same
 * `city`/`country` and slot in ahead of manual data.
 */

import type {
  IngredientPrice,
  PriceAlternative,
  PricedItem,
  PricingResult,
  ResolutionTier,
  ShoppingListItem,
  Currency,
} from "./types";
import {
  fetchManualPrices,
  MANUAL_PRICES,
  COUNTRY_BY_NAME,
  COUNTRY_REGION,
  convertCurrency,
  COUNTRIES,
} from "./sources/manual";
import { resolveCountry } from "@/lib/country";
import { trackFallbackUsage } from "@/lib/telemetry/global";
import { fetchExternalApiPrices } from "./sources/external-api";
import { fetchWebImportPrices } from "./sources/web-import";
import { withCacheAndFallback } from "./price-cache";
import type { PriceProvider } from "./providers/types";
import { tescoProvider } from "./providers/tesco";
import { carrefourProvider } from "./providers/carrefour";
import { walmartProvider } from "./providers/walmart";
import { krogerProvider } from "./providers/kroger";
import { openFoodFactsProvider } from "./providers/open-food-facts";
import { csvImportProvider } from "./providers/csv-import";
import { scraperProvider } from "./providers/scraper";

export type {
  IngredientPrice,
  PriceAlternative,
  PricedItem,
  PricingResult,
  ShoppingListItem,
  SourceType,
  ResolutionTier,
  Currency,
  IngredientCategory,
} from "./types";

// ─── Provider registry ────────────────────────────────────────────────
const PROVIDERS: PriceProvider[] = [
  tescoProvider,
  carrefourProvider,
  walmartProvider,
  krogerProvider,
  openFoodFactsProvider,
  csvImportProvider,
  scraperProvider,
];

/**
 * Load all candidate rows that could possibly satisfy a request, INCLUDING
 * rows from other countries. The resolver picks the best tier per ingredient
 * downstream. Provider results take priority over manual data via the
 * confidence merge below.
 */
async function loadAllPrices(city: string, country: string): Promise<IngredientPrice[]> {
  const key = `prices-all|${city.toLowerCase()}|${country.toLowerCase()}`;
  return withCacheAndFallback(
    key,
    async () => {
      const providerCalls = PROVIDERS.map((p) =>
        withCacheAndFallback(`${p.id}|${city}|${country}`, () => p.fetchPrices(city, country), []),
      );
      const [external, webImport, manualLocal, ...providerResults] = await Promise.all([
        fetchExternalApiPrices(city, country),
        fetchWebImportPrices(city, country),
        fetchManualPrices(city, country),
        ...providerCalls,
      ]);

      // Local (city + country) rows are merged with the global manual DB.
      // Resolver disambiguates by tier later, so duplicates per
      // (ingredient_name, city, country) are fine.
      const merged = [
        ...external,
        ...webImport,
        ...providerResults.flat(),
        ...manualLocal,
        ...MANUAL_PRICES, // every country, for fallback tiers
      ];

      // De-dup by (ingredient_name, city, country) — keep highest confidence.
      const byKey = new Map<string, IngredientPrice>();
      for (const p of merged) {
        const k = `${p.ingredient_name.toLowerCase()}|${p.city.toLowerCase()}|${p.country.toLowerCase()}`;
        const prev = byKey.get(k);
        if (!prev || p.confidence_score > prev.confidence_score) byKey.set(k, p);
      }
      return [...byKey.values()];
    },
    [],
  );
}

function normalise(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(s: string) {
  return new Set(
    normalise(s)
      .split(" ")
      .filter((t) => t && !/^(fresh|dried|ground|chopped|sliced|grated|whole|ripe|free|range|extra|virgin)$/.test(t)),
  );
}

const PRICE_NAME_ALIASES: Record<string, string[]> = {
  "lamb shoulder": ["lamb", "beef steak"],
  "ground lamb or beef": ["beef mince"],
  "ground beef": ["beef mince"],
  "grass fed beef mince": ["beef mince"],
  "boneless chicken thighs": ["chicken thighs"],
  "chopped tomatoes": ["canned tomatoes", "tomatoes"],
  "crushed tomatoes": ["canned tomatoes", "tomatoes"],
  passata: ["tomato sauce", "tomatoes"],
  "tomato passata": ["tomato sauce", "tomatoes"],
  "fresh mozzarella": ["mozzarella"],
  "00 flour": ["pizza flour", "flour"],
  "penne pasta": ["pasta"],
  spaghetti: ["pasta"],
  "sourdough bread": ["sourdough loaf", "wholegrain bread"],
  bread: ["wholegrain bread", "white bread"],
  "mixed berries": ["blueberries", "strawberries"],
  berries: ["blueberries", "strawberries"],
  "dried apricots": ["apples"],
  "mixed spices": ["spices"],
  cumin: ["spices"],
  coriander: ["spices"],
  turmeric: ["spices"],
  "curry powder": ["spices"],
  "chilli flakes": ["spices"],
  "chili flakes": ["spices"],
  "chilli powder": ["spices"],
  oregano: ["dried herbs"],
  "dried oregano": ["dried herbs"],
  "dried thyme": ["dried herbs"],
  "dried rosemary": ["dried herbs"],
  "bay leaves": ["dried herbs"],
  "italian herbs": ["dried herbs"],
  thyme: ["fresh herbs"],
  rosemary: ["fresh herbs"],
  parsley: ["fresh herbs"],
  "flat leaf parsley": ["fresh herbs"],
  mint: ["fresh herbs"],
  basil: ["fresh herbs"],
  "fresh coriander": ["fresh herbs"],
  cilantro: ["fresh herbs"],
  dill: ["fresh herbs"],
  chives: ["fresh herbs"],
  "spring onions": ["fresh herbs", "onions"],
  paprika: ["paprika"],
  "smoked paprika": ["paprika"],
  "sweet paprika": ["paprika"],
  cinnamon: ["cinnamon"],
  "ground cinnamon": ["cinnamon"],
  tahini: ["tahini"],
  capers: ["capers"],
  olives: ["olives"],
  "kalamata olives": ["olives"],
  "green olives": ["olives"],
  "black olives": ["olives"],
  "bulgur wheat": ["bulgur wheat"],
  bulgur: ["bulgur wheat"],
  "cracked wheat": ["bulgur wheat"],
  "pita bread": ["pita bread"],
  pita: ["pita bread"],
  "pita or rice": ["pita bread"],
  flatbread: ["pita bread"],
  "red wine vinegar": ["vinegar"],
  "white wine vinegar": ["vinegar"],
  "apple cider vinegar": ["vinegar"],
  "rice vinegar": ["vinegar"],
  "double cream": ["cooking cream"],
  "single cream": ["cooking cream"],
  "heavy cream": ["cooking cream"],
  cream: ["cooking cream"],
  "creme fraiche": ["cooking cream"],
  lemon: ["lemons"],
  lemons: ["lemons"],
  onion: ["onions"],
  onions: ["onions"],
  garlic: ["garlic"],
  "red onion": ["onions"],
  "bell pepper": ["bell peppers"],
  "bell peppers": ["bell peppers"],
};

/** Token-overlap match; returns score 0..1. */
function matchScore(ingredient: string, candidate: string): number {
  const needle = tokens(ingredient);
  if (needle.size === 0) return 0;
  const hay = tokens(candidate);
  let overlap = 0;
  for (const t of needle) if (hay.has(t)) overlap++;
  if (overlap === 0) return 0;
  return overlap / Math.max(needle.size, hay.size);
}

/** Find rows whose name plausibly matches the ingredient. Only the rows
 *  sharing the BEST score are returned: when an exact product exists ("Pita
 *  bread") we must not dilute its price with weaker token matches such as
 *  "Wholegrain bread". */
function findMatches(ingredient: string, prices: IngredientPrice[]): IngredientPrice[] {
  const names = [normalise(ingredient), ...(PRICE_NAME_ALIASES[normalise(ingredient)] ?? [])];
  const scored = prices
    .map((p) => ({
      p,
      score: Math.max(...names.map((name) => matchScore(name, p.ingredient_name))),
    }))
    .filter((m) => m.score >= 0.34)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return [];
  const best = scored[0].score;
  return scored.filter((m) => m.score >= best - 0.001).map((m) => m.p);
}

/**
 * Resolve a single price using the fallback hierarchy.
 * Returns the synthesized IngredientPrice (averages get a synthetic row)
 * and the tier that produced it.
 */
function resolveTiered(
  ingredient: string,
  candidates: IngredientPrice[],
  city: string,
  countrySpec: { country: string; currency: Currency },
): { price: IngredientPrice | null; tier: ResolutionTier } {
  const matches = findMatches(ingredient, candidates);
  if (matches.length === 0) return { price: null, tier: "missing" };

  const cityLc = (city || "").toLowerCase();
  const region = COUNTRY_REGION[countrySpec.country.toLowerCase()];

  // Tier 1 — exact city + country
  const cityMatch = matches.find(
    (m) => m.country === countrySpec.country && m.city.toLowerCase() === cityLc && cityLc !== "",
  );
  if (cityMatch) return { price: cityMatch, tier: "city" };

  // Tier 2 — country baseline (city: "*") or any same-country row
  const countryRows = matches.filter((m) => m.country === countrySpec.country);
  if (countryRows.length) {
    return { price: averageRow(countryRows, countrySpec, "country", ingredient), tier: "country" };
  }

  // Tier 3 — region (same continent / market group)
  if (region) {
    const regionRows = matches.filter((m) => COUNTRY_REGION[m.country.toLowerCase()] === region);
    if (regionRows.length) {
      return { price: averageRow(regionRows, countrySpec, "region", ingredient), tier: "region" };
    }
  }

  // Tier 4 — global average across all matches
  return { price: averageRow(matches, countrySpec, "global", ingredient), tier: "global" };
}

/** Base-unit factor: how many base units (g / ml / piece) one row unit is. */
const UNIT_BASE_FACTOR: Record<string, number> = {
  g: 1, kg: 1000,
  ml: 1, l: 1000,
  unit: 1, pack: 1,
};

/**
 * Average per-unit price across rows, currency-converted into the target
 * country's currency. Averaging happens in BASE units (g / ml / piece) so a
 * "500 ml @ €5.50" row never gets mixed with a "1 kg @ €2.40" row — that
 * unit-blind mix used to produce absurd estimates (e.g. €600 olive oil) which
 * the safety cap then silently zeroed into "price unavailable".
 */
function averageRow(
  rows: IngredientPrice[],
  target: { country: string; currency: Currency },
  tier: ResolutionTier,
  ingredient: string,
): IngredientPrice {
  const template = rows[0];
  const templateFam = UNIT_FAMILY[template.unit];
  const templateFactor = UNIT_BASE_FACTOR[template.unit] ?? 1;
  let total = 0;
  let n = 0;
  for (const r of rows) {
    if (!Number.isFinite(r.price) || r.price <= 0 || !(r.quantity > 0)) continue;
    // Only average rows measured in the same physical family as the template.
    if (UNIT_FAMILY[r.unit] !== templateFam) continue;
    const factor = UNIT_BASE_FACTOR[r.unit] ?? 1;
    const perBaseUnit = r.price / (r.quantity * factor); // price per g / ml / piece
    total += convertCurrency(perBaseUnit, r.currency, target.currency);
    n += 1;
  }
  const avgPerBaseUnit = n > 0 ? total / n : 0;
  const synthPrice =
    Math.round(avgPerBaseUnit * template.quantity * templateFactor * 100) / 100;
  return {
    ...template,
    id: `avg-${tier}-${target.country.toLowerCase()}-${normalise(ingredient).replace(/\s+/g, "-")}`,
    price: synthPrice,
    currency: target.currency,
    country: target.country,
    city: "*",
    supermarket: null,
    confidence_score: tier === "country" ? 0.7 : tier === "region" ? 0.55 : 0.4,
  };
}

/** Unit family for compatibility checks — prevents "3 cans" being scaled
 *  against a "kg" row (the root cause of absurd estimates like €95 rice
 *  vinegar from a cross-category token-overlap match). */
const UNIT_FAMILY: Record<string, "mass" | "volume" | "count"> = {
  g: "mass", kg: "mass",
  ml: "volume", l: "volume",
  unit: "count", pack: "count",
};

interface ParsedShoppingQty {
  amount: number;
  unit: "g" | "kg" | "ml" | "l" | "unit" | "pack";
}

function parseShoppingQty(qty: string): ParsedShoppingQty | null {
  const match = qty.match(/([\d.]+)\s*([a-zA-Z]*)/);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unitRaw = (match[2] || "").toLowerCase();
  if (unitRaw === "kg") return { amount, unit: "kg" };
  if (unitRaw === "g") return { amount, unit: "g" };
  if (unitRaw === "l") return { amount, unit: "l" };
  if (unitRaw === "ml") return { amount, unit: "ml" };
  if (/^(tbsp|tablespoon|tablespoons)$/.test(unitRaw)) return { amount: amount * 15, unit: "ml" };
  if (/^(tsp|teaspoon|teaspoons)$/.test(unitRaw)) return { amount: amount * 5, unit: "ml" };
  if (/^(cup|cups)$/.test(unitRaw)) return { amount: amount * 240, unit: "ml" };
  if (/^(pinch|pinches|dash)$/.test(unitRaw)) return { amount: amount * 2, unit: "ml" };
  if (/^(pack|packs)$/.test(unitRaw)) return { amount, unit: "pack" };
  if (/^(slice|slices)$/.test(unitRaw)) return { amount: Math.ceil(amount / 20), unit: "unit" };
  if (/^(clove|cloves)$/.test(unitRaw)) return { amount: amount * 5, unit: "g" };
  if (/^(sprig|sprigs|leaf|leaves|handful|handfuls)$/.test(unitRaw)) return { amount: 1, unit: "unit" };
  if (/^(bunch|bunches|head|heads|loaf|loaves|can|cans|tin|tins|jar|jars|bottle|bottles|piece|pieces|pcs|unit|units)$/.test(unitRaw)) {
    return { amount, unit: "unit" };
  }
  if (unitRaw === "") return { amount, unit: "unit" };
  return null;
}

/** Typical edible weight of one piece, in grams — lets us price "2 lemons"
 *  against a "1 kg lemons" row instead of dropping the line entirely. */
const PIECE_WEIGHT_G: Array<{ match: RegExp; grams: number }> = [
  { match: /garlic/, grams: 60 },
  { match: /lemon|lime/, grams: 100 },
  { match: /onion/, grams: 150 },
  { match: /pepper(s)?$|bell pepper/, grams: 160 },
  { match: /tomato/, grams: 120 },
  { match: /zucchini|courgette|eggplant|aubergine/, grams: 200 },
  { match: /carrot/, grams: 80 },
  { match: /potato/, grams: 180 },
  { match: /cucumber/, grams: 300 },
  { match: /avocado/, grams: 200 },
  { match: /banana/, grams: 120 },
  { match: /apple|pear|orange|peach/, grams: 160 },
  { match: /broccoli|cauliflower|cabbage/, grams: 500 },
  { match: /herb|parsley|mint|basil|coriander/, grams: 30 },
  { match: /chicken breast|fillet|steak/, grams: 180 },
  { match: /pita|tortilla|flatbread/, grams: 60 },
  { match: /bread|loaf|sourdough/, grams: 400 },
  { match: /egg/, grams: 60 },
  { match: /canned|can of|tuna|beans|chickpea|tomatoes$/, grams: 400 },
];

function pieceWeightGrams(name: string): number | null {
  const n = normalise(name);
  for (const entry of PIECE_WEIGHT_G) if (entry.match.test(n)) return entry.grams;
  return null;
}

function toBaseAmount(qty: ParsedShoppingQty, targetUnit: IngredientPrice["unit"]): number | null {
  if (targetUnit === "g") return qty.unit === "kg" ? qty.amount * 1000 : qty.unit === "g" ? qty.amount : null;
  if (targetUnit === "kg") return qty.unit === "kg" ? qty.amount : qty.unit === "g" ? qty.amount / 1000 : null;
  if (targetUnit === "ml") return qty.unit === "l" ? qty.amount * 1000 : qty.unit === "ml" ? qty.amount : null;
  if (targetUnit === "l") return qty.unit === "l" ? qty.amount : qty.unit === "ml" ? qty.amount / 1000 : null;
  if (targetUnit === "unit" || targetUnit === "pack") return qty.unit === "unit" || qty.unit === "pack" ? qty.amount : null;
  return null;
}

function formatPackQuantity(price: IngredientPrice): string {
  const suffix = price.unit === "unit" ? "" : price.unit;
  return `${price.quantity}${suffix ? ` ${suffix}` : ""}`;
}

/** Parse a free-form quantity ("1.5 kg", "12", "3 tins") and scale price.
 *  Returns null when units are genuinely incompatible so the caller drops the
 *  estimate rather than displaying a bogus number. Count↔mass and
 *  volume↔mass gaps are bridged with piece weights / water density. */
function scalePrice(price: IngredientPrice, qty: string): { cost: number; packCount: number; packQuantity: string } | null {
  const parsed = parseShoppingQty(qty);
  if (!parsed) return null;
  const priceFam = UNIT_FAMILY[price.unit];
  const itemFam = UNIT_FAMILY[parsed.unit];
  if (!priceFam || !itemFam) return null;

  let effective: ParsedShoppingQty = parsed;

  if (priceFam !== itemFam) {
    const pieceG = pieceWeightGrams(price.ingredient_name);
    if (priceFam === "mass" && itemFam === "count" && pieceG) {
      effective = { amount: parsed.amount * pieceG, unit: "g" };
    } else if (priceFam === "count" && itemFam === "mass" && pieceG) {
      const grams = parsed.unit === "kg" ? parsed.amount * 1000 : parsed.amount;
      effective = { amount: Math.max(1, Math.ceil(grams / pieceG)), unit: "unit" };
    } else if (priceFam === "mass" && itemFam === "volume") {
      // Water density is close enough for pastes, sauces and dairy.
      const ml = parsed.unit === "l" ? parsed.amount * 1000 : parsed.amount;
      effective = { amount: ml, unit: "g" };
    } else if (priceFam === "volume" && itemFam === "mass") {
      const grams = parsed.unit === "kg" ? parsed.amount * 1000 : parsed.amount;
      effective = { amount: grams, unit: "ml" };
    } else if (priceFam === "count" && itemFam === "volume") {
      // A splash of a canned/jarred product still means "buy one".
      effective = { amount: 1, unit: "unit" };
    } else {
      return null;
    }
  }

  const required = toBaseAmount(effective, price.unit);
  if (required == null) return null;
  const packCount = Math.max(1, Math.ceil(required / price.quantity));
  return { cost: packCount * price.price, packCount, packQuantity: formatPackQuantity(price) };
}

/** Sanity cap per weekly grocery line. With unit-safe averaging in place a
 *  legitimate family line can still be sizeable (bulk protein for 6 people),
 *  so the cap only rejects clearly broken maths rather than zeroing real
 *  prices — that zeroing is what previously produced "pricing incomplete". */
function sanitizeEstimate(cost: number | null, category: string): number {
  if (cost == null || !Number.isFinite(cost) || cost <= 0) return 0;
  const cap = category === "Proteins" ? 90 : 60;
  if (cost > cap) return 0;
  return Math.round(cost * 100) / 100;
}

function resolveCountrySpec(country: string): { country: string; currency: Currency } {
  // 1. Manual price DB spec — preferred because it carries the local
  //    supermarket + baseline units expected by the price rows.
  const spec = COUNTRY_BY_NAME[(country || "").toLowerCase()];
  if (spec) return { country: spec.country, currency: spec.currency };
  // 2. Global Country Resolver — any ISO α-2 / name yields a currency,
  //    even for countries we don't yet carry manual prices for. Missing
  //    manual data just means the resolver drops to region/global tiers.
  const profile = resolveCountry(country);
  if (profile) {
    trackFallbackUsage({
      where: "price-data.resolveCountrySpec",
      from: country,
      to: `${profile.code}/${profile.currency}`,
    });
    return { country: profile.name, currency: profile.currency };
  }
  // 3. Truly unknown input — surface an "unknown" bucket rather than
  //    silently pretending we're in the UK. Callers see currency: ""
  //    and skip rendering prices; the UI prompts the user to pick a country.
  trackFallbackUsage({
    where: "price-data.resolveCountrySpec",
    from: country || "(empty)",
    to: "unknown",
  });
  return { country: "", currency: "" };
}

// ─── Public API ───────────────────────────────────────────────────────

export async function getIngredientPrice(
  ingredient: string,
  city: string,
  country: string,
): Promise<IngredientPrice | null> {
  const candidates = await loadAllPrices(city, country);
  const target = resolveCountrySpec(country);
  const { price } = resolveTiered(ingredient, candidates, city, target);
  return price;
}

export async function getPricesForShoppingList(
  shoppingList: ShoppingListItem[],
  city: string,
  country: string,
): Promise<PricingResult> {
  const candidates = await loadAllPrices(city, country);
  const target = resolveCountrySpec(country);

  const tierCounts: Record<ResolutionTier, number> = {
    city: 0, country: 0, region: 0, global: 0, missing: 0,
  };
  const missing: string[] = [];

  const items: PricedItem[] = shoppingList.map((item) => {
    const { price, tier } = resolveTiered(item.name, candidates, city, target);
    tierCounts[tier] += 1;
    if (tier === "missing") missing.push(item.name);
    const scaled = price ? scalePrice(price, item.quantity) : null;
    const estimatedCost = sanitizeEstimate(scaled?.cost ?? null, item.category);
    const hasPrice = estimatedCost > 0 && !!scaled;
    return {
      ...item,
      quantity: hasPrice && scaled.packCount > 1
        ? `${scaled.packCount} packs (${item.quantity} needed)`
        : item.quantity,
      matchedPrice: hasPrice ? price : null,
      estimatedCost,
      confidence: hasPrice ? (price?.confidence_score ?? 0) : 0,
      resolutionTier: hasPrice ? tier : "missing",
      packCount: hasPrice ? scaled.packCount : undefined,
      packQuantity: hasPrice ? scaled.packQuantity : undefined,
      requiredQuantity: item.quantity,
    };
  });

  const matched = items.filter((i) => i.matchedPrice);
  const totalCost = Math.round(items.reduce((s, i) => s + i.estimatedCost, 0) * 100) / 100;
  const coverage = items.length === 0 ? 0 : matched.length / items.length;
  const averageConfidence =
    matched.length === 0 ? 0 : matched.reduce((s, i) => s + i.confidence, 0) / matched.length;

  // eslint-disable-next-line no-console
  console.log("[price-resolver]", {
    city, country: target.country, currency: target.currency,
    items: items.length, coverage: Math.round(coverage * 100) + "%",
    totalCost, tierCounts, missing,
  });

  return {
    items,
    totalCost,
    currency: target.currency,
    coverage,
    averageConfidence,
    missing,
    tierCounts,
  };
}

export async function calculateTotalEstimatedCost(
  shoppingList: ShoppingListItem[],
  city: string,
  country: string,
): Promise<{ total: number; currency: Currency }> {
  const result = await getPricesForShoppingList(shoppingList, city, country);
  return { total: result.totalCost, currency: result.currency };
}

// ─── Smart alternatives ───────────────────────────────────────────────

interface AltSpec {
  to: string;
  nutritionImpact: "similar" | "better" | "lower";
}
const ALTERNATIVE_MAP: Record<string, AltSpec[]> = {
  "chicken breast":           [{ to: "Chicken thighs",           nutritionImpact: "similar" }],
  "branded cereal":           [{ to: "Oats",                     nutritionImpact: "better" }],
  "breakfast cereal":         [{ to: "Oats",                     nutritionImpact: "better" }],
  "avocado":                  [{ to: "Extra virgin olive oil",   nutritionImpact: "similar" }],
  "salmon":                   [{ to: "Canned tuna",              nutritionImpact: "similar" }],
  "salmon fillets":           [{ to: "Canned tuna",              nutritionImpact: "similar" }],
  "beef mince":               [{ to: "Red lentils",              nutritionImpact: "better" },
                               { to: "Chickpeas",                nutritionImpact: "better" }],
  "imported vegetables":      [{ to: "Seasonal veg pack",        nutritionImpact: "similar" }],
  "out of season vegetables": [{ to: "Seasonal veg pack",        nutritionImpact: "similar" }],
  "white bread":              [{ to: "Wholegrain bread",         nutritionImpact: "better" }],
  "butter":                   [{ to: "Extra virgin olive oil",   nutritionImpact: "better" }],
};

export async function comparePriceAlternatives(
  ingredient: string,
  city: string,
  country: string,
): Promise<PriceAlternative[]> {
  const candidates = await loadAllPrices(city, country);
  const target = resolveCountrySpec(country);
  const { price: base } = resolveTiered(ingredient, candidates, city, target);
  if (!base) return [];

  const alts = ALTERNATIVE_MAP[normalise(ingredient)] ?? [];
  const out: PriceAlternative[] = [];
  for (const spec of alts) {
    const { price: alt } = resolveTiered(spec.to, candidates, city, target);
    if (!alt) continue;
    const basePer = base.price / base.quantity;
    const altPer = alt.price / alt.quantity;
    const save = Math.round((basePer - altPer) * 100) / 100;
    if (save > 0) {
      out.push({
        from: base.ingredient_name,
        to: alt.ingredient_name,
        save,
        currency: base.currency,
        nutritionImpact: spec.nutritionImpact,
      });
    }
  }
  return out;
}

// Re-export country metadata so callers (e.g. UI) can list supported markets.
export { COUNTRIES, COUNTRY_BY_NAME, COUNTRY_REGION } from "./sources/manual";

/** Test helper / dev tool — clears the in-memory price cache. */
export { cacheClear as _resetPriceCache } from "./price-cache";
