/**
 * Manual price database — multi-country with tiered fallback metadata.
 *
 * Each country has a baseline price per catalog item (`city: "*"`) plus a
 * handful of city-specific overrides for places where prices materially
 * diverge from the national average. The resolver in `../../index.ts` is
 * responsible for picking the best tier (city → country → region → global).
 *
 * Adding a new country is ~60 numbers, nothing more.
 */

import type { CatalogItem } from "./catalog";
import { CATALOG, CATALOG_BY_KEY } from "./catalog";
import type {
  Currency,
  IngredientPrice,
  SourceType,
} from "../../types";

export type { CatalogItem } from "./catalog";
export { CATALOG, CATALOG_BY_KEY } from "./catalog";

const today = new Date().toISOString().slice(0, 10);

export type Region = "EU" | "UK" | "NA" | "MENA";

export interface CountrySpec {
  /** ISO-like short code stored on profiles (e.g. "Italy", "UK"). */
  country: string;
  currency: Currency;
  region: Region;
  /** Default city used when a row is country-level (`city: "*"`). */
  capital: string;
  /** Per-catalog-key baseline price for the country. */
  baseline: Record<string, number>;
  /** Optional per-city overrides. */
  cityOverrides?: Record<string, Partial<Record<string, number>>>;
  /** Supermarkets typically associated with this country (for the `supermarket` field). */
  defaultSupermarket: string;
}

export const COUNTRY_CURRENCY: Record<string, Currency> = {
  italy: "EUR",
  uk: "GBP",
  germany: "EUR",
  france: "EUR",
  spain: "EUR",
  uae: "AED",
  usa: "USD",
};

export const COUNTRY_REGION: Record<string, Region> = {
  italy: "EU",
  germany: "EU",
  france: "EU",
  spain: "EU",
  uk: "UK",
  usa: "NA",
  uae: "MENA",
};

/**
 * FX rates relative to EUR — only used when falling back across regions so
 * a US user querying an EU-only item still gets USD. These are NOT real-time
 * — replace with a real FX source when a feed lands.
 */
export const FX_TO_EUR: Record<Currency, number> = {
  EUR: 1,
  GBP: 1.16,
  USD: 0.92,
  AED: 0.25,
};

export function convertCurrency(amount: number, from: Currency, to: Currency): number {
  if (from === to) return amount;
  const inEur = amount * FX_TO_EUR[from];
  return inEur / FX_TO_EUR[to];
}

// ─── Country price tables ────────────────────────────────────────────
// Prices reflect typical 2025 supermarket averages. They are estimates.

const IT: CountrySpec = {
  country: "Italy",
  currency: "EUR",
  region: "EU",
  capital: "Rome",
  defaultSupermarket: "Esselunga",
  baseline: {
    chicken_breast: 9.50, chicken_thighs: 6.50, beef_mince: 12.00, pork_loin: 9.00,
    salmon_fillet: 22.00, white_fish: 14.00, tuna_can: 1.40, eggs: 3.20,
    tofu: 2.80, red_lentils: 2.20, chickpeas: 0.90, black_beans: 1.20,
    greek_yogurt: 4.20, milk: 1.30, mozzarella: 2.20, feta: 2.80, parmesan: 6.50,
    tomatoes: 2.40, cucumber: 0.90, bell_peppers: 3.20, onions: 1.40, garlic: 1.80,
    carrots: 1.30, potatoes: 1.20, salad_greens: 1.90, spinach: 1.60,
    broccoli: 2.40, zucchini: 1.80, eggplant: 2.20, mushrooms: 1.90,
    seasonal_veg: 5.50, onions_garlic: 1.60, carrots_celery: 1.70,
    bananas: 1.80, apples: 2.20, oranges: 1.80, lemons: 2.40,
    strawberries: 3.20, grapes: 3.40, pears: 2.40, avocado: 1.40,
    pasta: 1.40, rice: 2.20, wholegrain_bread: 2.20, white_bread: 1.40,
    oats: 1.60, flour: 1.10, pizza_flour: 1.30, couscous: 1.80, quinoa: 3.80, cereal: 3.40,
    olive_oil: 6.50, sunflower_oil: 2.80, butter: 2.40, mixed_nuts: 3.20,
    almonds: 3.80, peanut_butter: 3.40, seeds: 2.60,
    salt: 0.50, sugar: 1.00, black_pepper: 1.80, canned_tomatoes: 0.80,
    tomato_sauce: 1.40, honey: 4.20, coffee: 3.80, tea: 2.20,
    vinegar: 1.20, mustard: 1.60,
  },
  cityOverrides: {
    Milan:    { chicken_breast: 10.50, salmon_fillet: 24.00, olive_oil: 7.20, tomatoes: 2.80, parmesan: 7.20 },
    Rome:     { chicken_breast: 9.80,  salmon_fillet: 22.50, olive_oil: 6.80, mozzarella: 2.40 },
    Naples:   { chicken_breast: 8.50,  tomatoes: 1.90, mozzarella: 1.90, pizza_flour: 1.10 },
    Turin:    { chicken_breast: 10.20, beef_mince: 12.80, butter: 2.80 },
    Bologna:  { pasta: 1.60, parmesan: 6.20, mortadella_proxy: 0 },
    Florence: { olive_oil: 7.40, beef_mince: 13.00, bread: 0 },
    Venice:   { white_fish: 16.00, salmon_fillet: 24.50, tomatoes: 2.80 },
    Palermo:  { salmon_fillet: 18.00, tomatoes: 1.80, oranges: 1.20, olive_oil: 5.80 },
    Bari:     { olive_oil: 5.40, white_fish: 12.00, tomatoes: 1.90 },
    Genoa:    { white_fish: 15.00, olive_oil: 6.80, pasta: 1.50 },
    Verona:   { chicken_breast: 9.80, rice: 2.40, butter: 2.50 },
    Catania:  { tomatoes: 1.70, oranges: 1.10, olive_oil: 5.60, eggplant: 1.80 },
  },
};

const UK: CountrySpec = {
  country: "UK",
  currency: "GBP",
  region: "UK",
  capital: "London",
  defaultSupermarket: "Tesco",
  baseline: {
    chicken_breast: 8.50, chicken_thighs: 5.20, beef_mince: 7.20, pork_loin: 7.80,
    salmon_fillet: 18.00, white_fish: 12.00, tuna_can: 1.20, eggs: 3.20,
    tofu: 2.20, red_lentils: 1.80, chickpeas: 0.70, black_beans: 0.90,
    greek_yogurt: 3.20, milk: 1.40, mozzarella: 1.80, feta: 2.80, parmesan: 5.40,
    tomatoes: 2.40, cucumber: 0.80, bell_peppers: 2.10, onions: 1.10, garlic: 1.60,
    carrots: 0.90, potatoes: 1.20, salad_greens: 2.20, spinach: 1.80,
    broccoli: 2.20, zucchini: 1.90, eggplant: 2.40, mushrooms: 1.90,
    seasonal_veg: 5.50, onions_garlic: 1.50, carrots_celery: 1.80,
    bananas: 1.20, apples: 2.40, oranges: 2.20, lemons: 2.80,
    strawberries: 3.40, grapes: 3.80, pears: 2.60, avocado: 1.10,
    pasta: 1.85, rice: 2.00, wholegrain_bread: 1.80, white_bread: 1.10,
    oats: 1.20, flour: 1.00, pizza_flour: 1.40, couscous: 1.60, quinoa: 4.20, cereal: 4.00,
    olive_oil: 5.50, sunflower_oil: 2.40, butter: 2.20, mixed_nuts: 2.80,
    almonds: 3.40, peanut_butter: 2.80, seeds: 2.40,
    salt: 0.50, sugar: 1.20, black_pepper: 2.20, canned_tomatoes: 0.65,
    tomato_sauce: 1.40, honey: 3.80, coffee: 4.20, tea: 2.40,
    vinegar: 1.10, mustard: 1.40,
  },
};

const DE: CountrySpec = {
  country: "Germany",
  currency: "EUR",
  region: "EU",
  capital: "Berlin",
  defaultSupermarket: "Rewe",
  baseline: {
    chicken_breast: 11.00, chicken_thighs: 7.20, beef_mince: 11.50, pork_loin: 8.50,
    salmon_fillet: 24.00, white_fish: 14.00, tuna_can: 1.60, eggs: 3.40,
    tofu: 2.40, red_lentils: 2.40, chickpeas: 0.95, black_beans: 1.20,
    greek_yogurt: 3.80, milk: 1.20, mozzarella: 1.60, feta: 2.40, parmesan: 5.80,
    tomatoes: 2.80, cucumber: 0.80, bell_peppers: 3.20, onions: 1.30, garlic: 2.20,
    carrots: 1.20, potatoes: 1.40, salad_greens: 2.00, spinach: 1.80,
    broccoli: 2.80, zucchini: 2.40, eggplant: 2.80, mushrooms: 2.20,
    seasonal_veg: 5.80, onions_garlic: 1.70, carrots_celery: 1.80,
    bananas: 1.40, apples: 2.20, oranges: 2.20, lemons: 2.60,
    strawberries: 3.40, grapes: 3.80, pears: 2.40, avocado: 1.60,
    pasta: 1.30, rice: 2.20, wholegrain_bread: 2.40, white_bread: 1.60,
    oats: 1.40, flour: 0.90, pizza_flour: 1.20, couscous: 1.80, quinoa: 3.80, cereal: 3.20,
    olive_oil: 6.80, sunflower_oil: 2.60, butter: 2.40, mixed_nuts: 3.40,
    almonds: 3.80, peanut_butter: 3.20, seeds: 2.40,
    salt: 0.60, sugar: 1.10, black_pepper: 1.80, canned_tomatoes: 0.70,
    tomato_sauce: 1.40, honey: 4.20, coffee: 4.80, tea: 2.40,
    vinegar: 1.20, mustard: 1.20,
  },
};

const FR: CountrySpec = {
  country: "France",
  currency: "EUR",
  region: "EU",
  capital: "Paris",
  defaultSupermarket: "Carrefour",
  baseline: {
    chicken_breast: 12.50, chicken_thighs: 7.80, beef_mince: 13.50, pork_loin: 10.00,
    salmon_fillet: 25.00, white_fish: 16.00, tuna_can: 1.80, eggs: 3.60,
    tofu: 3.20, red_lentils: 2.80, chickpeas: 1.10, black_beans: 1.40,
    greek_yogurt: 4.40, milk: 1.20, mozzarella: 2.20, feta: 3.20, parmesan: 6.80,
    tomatoes: 3.20, cucumber: 1.00, bell_peppers: 3.60, onions: 1.60, garlic: 2.40,
    carrots: 1.40, potatoes: 1.40, salad_greens: 2.40, spinach: 2.00,
    broccoli: 3.00, zucchini: 2.40, eggplant: 2.80, mushrooms: 2.40,
    seasonal_veg: 6.20, onions_garlic: 1.80, carrots_celery: 1.90,
    bananas: 1.80, apples: 2.40, oranges: 2.20, lemons: 2.80,
    strawberries: 3.80, grapes: 4.20, pears: 2.60, avocado: 1.80,
    pasta: 1.60, rice: 2.40, wholegrain_bread: 2.40, white_bread: 1.40,
    oats: 1.80, flour: 1.20, pizza_flour: 1.40, couscous: 1.80, quinoa: 4.20, cereal: 3.60,
    olive_oil: 7.20, sunflower_oil: 3.00, butter: 2.80, mixed_nuts: 3.80,
    almonds: 4.20, peanut_butter: 3.80, seeds: 2.80,
    salt: 0.80, sugar: 1.20, black_pepper: 2.20, canned_tomatoes: 0.90,
    tomato_sauce: 1.60, honey: 5.20, coffee: 5.40, tea: 2.80,
    vinegar: 1.40, mustard: 1.40,
  },
};

const ES: CountrySpec = {
  country: "Spain",
  currency: "EUR",
  region: "EU",
  capital: "Madrid",
  defaultSupermarket: "Mercadona",
  baseline: {
    chicken_breast: 8.20, chicken_thighs: 5.40, beef_mince: 10.50, pork_loin: 7.80,
    salmon_fillet: 18.00, white_fish: 12.00, tuna_can: 1.30, eggs: 2.80,
    tofu: 2.60, red_lentils: 2.20, chickpeas: 0.80, black_beans: 1.10,
    greek_yogurt: 3.80, milk: 1.10, mozzarella: 2.00, feta: 2.60, parmesan: 5.80,
    tomatoes: 2.20, cucumber: 0.80, bell_peppers: 2.40, onions: 1.20, garlic: 1.60,
    carrots: 1.10, potatoes: 1.10, salad_greens: 1.80, spinach: 1.60,
    broccoli: 2.20, zucchini: 1.60, eggplant: 1.80, mushrooms: 2.20,
    seasonal_veg: 4.80, onions_garlic: 1.40, carrots_celery: 1.50,
    bananas: 1.60, apples: 1.80, oranges: 1.40, lemons: 1.80,
    strawberries: 2.80, grapes: 2.80, pears: 2.20, avocado: 1.40,
    pasta: 1.20, rice: 1.80, wholegrain_bread: 1.80, white_bread: 1.10,
    oats: 1.40, flour: 1.00, pizza_flour: 1.20, couscous: 1.60, quinoa: 3.40, cereal: 3.20,
    olive_oil: 5.80, sunflower_oil: 2.40, butter: 2.40, mixed_nuts: 3.20,
    almonds: 4.00, peanut_butter: 3.20, seeds: 2.40,
    salt: 0.50, sugar: 0.90, black_pepper: 1.80, canned_tomatoes: 0.70,
    tomato_sauce: 1.20, honey: 4.40, coffee: 3.60, tea: 2.00,
    vinegar: 1.20, mustard: 1.40,
  },
};

const AE: CountrySpec = {
  country: "UAE",
  currency: "AED",
  region: "MENA",
  capital: "Dubai",
  defaultSupermarket: "Carrefour UAE",
  baseline: {
    chicken_breast: 32.00, chicken_thighs: 24.00, beef_mince: 44.00, pork_loin: 0, // not common
    salmon_fillet: 75.00, white_fish: 48.00, tuna_can: 6.00, eggs: 14.00,
    tofu: 12.00, red_lentils: 9.00, chickpeas: 4.50, black_beans: 5.50,
    greek_yogurt: 18.00, milk: 6.50, mozzarella: 11.00, feta: 14.00, parmesan: 32.00,
    tomatoes: 8.00, cucumber: 3.00, bell_peppers: 12.00, onions: 4.50, garlic: 9.00,
    carrots: 4.50, potatoes: 4.00, salad_greens: 10.00, spinach: 8.00,
    broccoli: 12.00, zucchini: 8.00, eggplant: 7.00, mushrooms: 11.00,
    seasonal_veg: 24.00, onions_garlic: 6.50, carrots_celery: 7.00,
    bananas: 5.00, apples: 9.50, oranges: 8.00, lemons: 9.00,
    strawberries: 16.00, grapes: 16.00, pears: 10.00, avocado: 6.50,
    pasta: 7.50, rice: 10.00, wholegrain_bread: 9.00, white_bread: 5.50,
    oats: 8.00, flour: 5.00, pizza_flour: 6.50, couscous: 9.00, quinoa: 22.00, cereal: 22.00,
    olive_oil: 32.00, sunflower_oil: 14.00, butter: 14.00, mixed_nuts: 22.00,
    almonds: 26.00, peanut_butter: 18.00, seeds: 14.00,
    salt: 2.50, sugar: 6.00, black_pepper: 10.00, canned_tomatoes: 4.00,
    tomato_sauce: 8.00, honey: 28.00, coffee: 28.00, tea: 14.00,
    vinegar: 7.00, mustard: 9.00,
  },
};

const US: CountrySpec = {
  country: "USA",
  currency: "USD",
  region: "NA",
  capital: "New York",
  defaultSupermarket: "Walmart",
  baseline: {
    chicken_breast: 8.50, chicken_thighs: 5.20, beef_mince: 12.00, pork_loin: 8.50,
    salmon_fillet: 24.00, white_fish: 15.00, tuna_can: 1.60, eggs: 4.20,
    tofu: 2.80, red_lentils: 2.40, chickpeas: 1.20, black_beans: 1.30,
    greek_yogurt: 5.20, milk: 4.00, mozzarella: 3.20, feta: 4.20, parmesan: 7.50,
    tomatoes: 4.40, cucumber: 1.20, bell_peppers: 4.40, onions: 2.40, garlic: 2.80,
    carrots: 1.80, potatoes: 2.00, salad_greens: 3.80, spinach: 3.20,
    broccoli: 3.80, zucchini: 3.20, eggplant: 3.40, mushrooms: 3.80,
    seasonal_veg: 8.00, onions_garlic: 2.60, carrots_celery: 2.80,
    bananas: 1.40, apples: 4.40, oranges: 3.80, lemons: 4.40,
    strawberries: 5.40, grapes: 6.40, pears: 4.20, avocado: 1.80,
    pasta: 2.20, rice: 3.40, wholegrain_bread: 4.80, white_bread: 2.80,
    oats: 3.00, flour: 1.80, pizza_flour: 2.40, couscous: 3.40, quinoa: 5.40, cereal: 5.20,
    olive_oil: 10.00, sunflower_oil: 4.40, butter: 4.80, mixed_nuts: 6.40,
    almonds: 7.20, peanut_butter: 4.80, seeds: 4.20,
    salt: 1.40, sugar: 2.80, black_pepper: 4.40, canned_tomatoes: 1.40,
    tomato_sauce: 2.80, honey: 7.80, coffee: 9.50, tea: 4.20,
    vinegar: 2.80, mustard: 2.80,
  },
};

// ─── Extended baselines (catalog items added after the initial v1) ──
// Centralised here so adding an ingredient doesn't require touching every
// country block. Numbers are typical 2025 supermarket averages; resolver
// still applies per-country FX/tier logic if a market is missing.
type Extras = Record<string, number>;
const EXTRAS_IT: Extras = {
  free_range_chicken: 13.50, whole_chicken: 7.50, beef_steak: 22.00,
  sausages: 4.20, bacon: 3.80, ham: 3.20, prawns: 5.50, kidney_beans: 1.10,
  yogurt: 2.20, cheddar: 3.20, ricotta: 2.40,
  cherry_tomatoes: 1.80, celery: 1.20, sweet_potatoes: 2.40,
  rocket: 1.80, kale: 2.20, cauliflower: 2.20, asparagus: 3.80,
  green_beans: 2.40, peas: 2.40, corn: 1.20, leek: 1.40, cabbage: 1.80,
  blueberries: 3.20, raspberries: 3.40, peaches: 2.80, melon: 3.40, watermelon: 0.90,
  basmati_rice: 3.20, sourdough: 3.80, tortillas: 2.40, noodles: 2.20, granola: 4.20,
  walnuts: 4.40, spices: 1.80, pesto: 2.80, stock_cubes: 2.20, soy_sauce: 2.40,
  jam: 2.80, balsamic_vinegar: 3.20, mayo: 2.60, ketchup: 2.20,
};
const EXTRAS_UK: Extras = {
  free_range_chicken: 11.50, whole_chicken: 5.50, beef_steak: 22.00,
  sausages: 3.40, bacon: 3.20, ham: 2.80, prawns: 5.20, kidney_beans: 0.70,
  yogurt: 1.80, cheddar: 3.20, ricotta: 2.60,
  cherry_tomatoes: 1.80, celery: 1.00, sweet_potatoes: 2.20,
  rocket: 1.60, kale: 1.80, cauliflower: 1.40, asparagus: 3.20,
  green_beans: 2.00, peas: 1.80, corn: 1.00, leek: 1.20, cabbage: 1.20,
  blueberries: 2.80, raspberries: 2.80, peaches: 3.20, melon: 2.80, watermelon: 0.80,
  basmati_rice: 3.20, sourdough: 2.80, tortillas: 1.80, noodles: 2.00, granola: 3.40,
  walnuts: 3.80, spices: 1.60, pesto: 2.40, stock_cubes: 1.80, soy_sauce: 2.00,
  jam: 2.20, balsamic_vinegar: 2.80, mayo: 2.40, ketchup: 2.20,
};
const EXTRAS_DE: Extras = {
  free_range_chicken: 14.50, whole_chicken: 8.00, beef_steak: 24.00,
  sausages: 4.80, bacon: 3.40, ham: 3.20, prawns: 6.50, kidney_beans: 0.95,
  yogurt: 1.80, cheddar: 2.80, ricotta: 2.60,
  cherry_tomatoes: 2.20, celery: 1.40, sweet_potatoes: 3.40,
  rocket: 1.80, kale: 2.40, cauliflower: 2.20, asparagus: 4.80,
  green_beans: 2.80, peas: 2.20, corn: 1.40, leek: 1.40, cabbage: 1.80,
  blueberries: 3.20, raspberries: 3.20, peaches: 3.20, melon: 3.40, watermelon: 1.20,
  basmati_rice: 3.40, sourdough: 3.60, tortillas: 2.40, noodles: 2.20, granola: 3.40,
  walnuts: 4.40, spices: 1.80, pesto: 2.80, stock_cubes: 2.20, soy_sauce: 2.40,
  jam: 2.40, balsamic_vinegar: 3.00, mayo: 2.60, ketchup: 2.40,
};
const EXTRAS_FR: Extras = {
  free_range_chicken: 16.00, whole_chicken: 9.50, beef_steak: 28.00,
  sausages: 5.20, bacon: 4.20, ham: 3.80, prawns: 7.20, kidney_beans: 1.20,
  yogurt: 2.00, cheddar: 3.80, ricotta: 3.20,
  cherry_tomatoes: 2.40, celery: 1.60, sweet_potatoes: 3.80,
  rocket: 2.20, kale: 2.80, cauliflower: 2.80, asparagus: 5.40,
  green_beans: 3.20, peas: 2.60, corn: 1.60, leek: 1.80, cabbage: 2.20,
  blueberries: 3.80, raspberries: 3.80, peaches: 3.60, melon: 3.80, watermelon: 1.40,
  basmati_rice: 3.80, sourdough: 4.20, tortillas: 2.80, noodles: 2.60, granola: 4.20,
  walnuts: 5.20, spices: 2.20, pesto: 3.20, stock_cubes: 2.40, soy_sauce: 2.80,
  jam: 3.20, balsamic_vinegar: 3.40, mayo: 2.80, ketchup: 2.60,
};
const EXTRAS_ES: Extras = {
  free_range_chicken: 11.00, whole_chicken: 6.50, beef_steak: 19.00,
  sausages: 4.00, bacon: 3.40, ham: 3.20, prawns: 6.20, kidney_beans: 0.80,
  yogurt: 1.80, cheddar: 3.40, ricotta: 2.40,
  cherry_tomatoes: 1.80, celery: 1.10, sweet_potatoes: 2.20,
  rocket: 1.60, kale: 2.00, cauliflower: 1.80, asparagus: 3.40,
  green_beans: 2.20, peas: 2.20, corn: 1.10, leek: 1.30, cabbage: 1.40,
  blueberries: 2.80, raspberries: 2.80, peaches: 2.40, melon: 2.40, watermelon: 0.80,
  basmati_rice: 2.80, sourdough: 3.20, tortillas: 2.20, noodles: 1.80, granola: 3.40,
  walnuts: 4.20, spices: 1.60, pesto: 2.40, stock_cubes: 1.80, soy_sauce: 2.00,
  jam: 2.40, balsamic_vinegar: 2.60, mayo: 2.20, ketchup: 1.80,
};
const EXTRAS_AE: Extras = {
  free_range_chicken: 44.00, whole_chicken: 26.00, beef_steak: 82.00,
  sausages: 18.00, bacon: 0, ham: 0, prawns: 24.00, kidney_beans: 5.00,
  yogurt: 9.00, cheddar: 14.00, ricotta: 11.00,
  cherry_tomatoes: 9.00, celery: 5.00, sweet_potatoes: 10.00,
  rocket: 7.00, kale: 10.00, cauliflower: 9.00, asparagus: 22.00,
  green_beans: 10.00, peas: 9.00, corn: 4.00, leek: 6.00, cabbage: 6.00,
  blueberries: 22.00, raspberries: 22.00, peaches: 14.00, melon: 12.00, watermelon: 3.50,
  basmati_rice: 14.00, sourdough: 14.00, tortillas: 11.00, noodles: 9.00, granola: 22.00,
  walnuts: 28.00, spices: 8.00, pesto: 14.00, stock_cubes: 9.00, soy_sauce: 9.00,
  jam: 14.00, balsamic_vinegar: 16.00, mayo: 11.00, ketchup: 10.00,
};
const EXTRAS_US: Extras = {
  free_range_chicken: 12.00, whole_chicken: 6.00, beef_steak: 22.00,
  sausages: 5.50, bacon: 5.50, ham: 4.80, prawns: 7.50, kidney_beans: 1.20,
  yogurt: 4.40, cheddar: 5.40, ricotta: 4.40,
  cherry_tomatoes: 3.80, celery: 2.20, sweet_potatoes: 2.40,
  rocket: 3.20, kale: 3.20, cauliflower: 3.40, asparagus: 5.80,
  green_beans: 3.40, peas: 3.20, corn: 1.20, leek: 2.20, cabbage: 2.00,
  blueberries: 4.80, raspberries: 4.40, peaches: 4.80, melon: 4.80, watermelon: 1.10,
  basmati_rice: 4.80, sourdough: 5.20, tortillas: 3.20, noodles: 3.40, granola: 5.40,
  walnuts: 8.40, spices: 3.80, pesto: 4.80, stock_cubes: 3.20, soy_sauce: 3.40,
  jam: 4.20, balsamic_vinegar: 4.80, mayo: 4.20, ketchup: 3.80,
};
Object.assign(IT.baseline, EXTRAS_IT);
Object.assign(UK.baseline, EXTRAS_UK);
Object.assign(DE.baseline, EXTRAS_DE);
Object.assign(FR.baseline, EXTRAS_FR);
Object.assign(ES.baseline, EXTRAS_ES);
Object.assign(AE.baseline, EXTRAS_AE);
Object.assign(US.baseline, EXTRAS_US);

// ── Extended baselines v3: herbs, spices, world pantry ──────────────
const EXTRAS_V3: Record<string, Extras> = {
  IT: { fresh_herbs: 1.20, dried_herbs: 1.20, paprika: 1.40, cinnamon: 1.50, tahini: 4.20, capers: 2.20, olives: 2.40, bulgur: 2.20, pita: 1.80, cream: 1.40 },
  UK: { fresh_herbs: 0.90, dried_herbs: 1.00, paprika: 1.20, cinnamon: 1.30, tahini: 3.20, capers: 1.60, olives: 1.80, bulgur: 1.80, pita: 1.00, cream: 1.30 },
  DE: { fresh_herbs: 1.10, dried_herbs: 1.10, paprika: 1.30, cinnamon: 1.40, tahini: 3.60, capers: 1.90, olives: 2.20, bulgur: 1.90, pita: 1.50, cream: 1.20 },
  FR: { fresh_herbs: 1.40, dried_herbs: 1.30, paprika: 1.60, cinnamon: 1.70, tahini: 4.40, capers: 2.40, olives: 2.60, bulgur: 2.20, pita: 1.90, cream: 1.50 },
  ES: { fresh_herbs: 1.00, dried_herbs: 1.00, paprika: 1.10, cinnamon: 1.30, tahini: 3.40, capers: 1.60, olives: 1.60, bulgur: 1.90, pita: 1.50, cream: 1.20 },
  AE: { fresh_herbs: 3.50, dried_herbs: 5.00, paprika: 6.00, cinnamon: 6.50, tahini: 12.00, capers: 9.00, olives: 9.00, bulgur: 7.00, pita: 3.50, cream: 6.00 },
  US: { fresh_herbs: 2.20, dried_herbs: 2.40, paprika: 2.80, cinnamon: 3.20, tahini: 6.40, capers: 3.40, olives: 3.60, bulgur: 3.40, pita: 3.00, cream: 2.60 },
};
Object.assign(IT.baseline, EXTRAS_V3.IT);
Object.assign(UK.baseline, EXTRAS_V3.UK);
Object.assign(DE.baseline, EXTRAS_V3.DE);
Object.assign(FR.baseline, EXTRAS_V3.FR);
Object.assign(ES.baseline, EXTRAS_V3.ES);
Object.assign(AE.baseline, EXTRAS_V3.AE);
Object.assign(US.baseline, EXTRAS_V3.US);

export const COUNTRIES: CountrySpec[] = [IT, UK, DE, FR, ES, AE, US];


const ISO_ALIAS: Record<string, string> = {
  italy: "it", uk: "uk", germany: "de", france: "fr",
  spain: "es", uae: "ae", usa: "us",
};

/**
 * Alias table for manual-DB country keys. Data-driven — no `country === "…"`
 * branching. Extending it to a new country is a single entry, not code.
 */
const MANUAL_COUNTRY_ALIASES: Record<string, string[]> = {
  UK: ["united kingdom", "great britain", "gb"],
  USA: ["united states", "us"],
  UAE: ["united arab emirates"],
};

export const COUNTRY_BY_NAME: Record<string, CountrySpec> = Object.fromEntries(
  COUNTRIES.flatMap((c) => {
    const name = c.country.toLowerCase();
    const iso = ISO_ALIAS[name];
    const extra = MANUAL_COUNTRY_ALIASES[c.country] ?? [];
    return [
      [name, c],
      ...(iso ? [[iso, c]] : []),
      ...extra.map((a) => [a, c] as [string, CountrySpec]),
    ];
  }),
) as Record<string, CountrySpec>;

// ─── Expansion → IngredientPrice[] ───────────────────────────────────

function makeRow(
  spec: CountrySpec,
  catalog: CatalogItem,
  city: string,
  price: number,
  confidence: number,
): IngredientPrice {
  const source_type: SourceType = "manual";
  return {
    id: `${spec.country.toLowerCase().replace(/\s+/g, "-")}-${city.toLowerCase().replace(/[*\s]+/g, "-")}-${catalog.key}`,
    ingredient_name: catalog.name,
    category: catalog.category,
    unit: catalog.unit,
    quantity: catalog.quantity,
    price,
    currency: spec.currency,
    city,
    country: spec.country,
    supermarket: spec.defaultSupermarket,
    source_type,
    source_url: null,
    last_updated: today,
    confidence_score: confidence,
  };
}

/** All rows for a single country (baseline + city overrides). */
export function rowsForCountry(spec: CountrySpec): IngredientPrice[] {
  const out: IngredientPrice[] = [];
  for (const [key, price] of Object.entries(spec.baseline)) {
    const cat = CATALOG_BY_KEY[key];
    if (!cat || !(price > 0)) continue;
    out.push(makeRow(spec, cat, "*", price, 0.85));
  }
  for (const [city, overrides] of Object.entries(spec.cityOverrides ?? {})) {
    for (const [key, price] of Object.entries(overrides)) {
      const cat = CATALOG_BY_KEY[key];
      if (!cat || !price || price <= 0) continue;
      out.push(makeRow(spec, cat, city, price, 0.92));
    }
  }
  return out;
}

/** Every manual row across every country — used by the resolver. */
export const MANUAL_PRICES: IngredientPrice[] =
  COUNTRIES.flatMap(rowsForCountry);

/**
 * Backward-compatible fetcher. Returns rows for the requested country plus
 * its city overrides if any. Resolver handles fallbacks beyond this.
 */
export async function fetchManualPrices(
  city: string,
  country: string,
): Promise<IngredientPrice[]> {
  const key = (country || "").toLowerCase();
  const spec = COUNTRY_BY_NAME[key];
  if (!spec) return [];
  const wantCity = (city || "").toLowerCase();
  return MANUAL_PRICES.filter((p) => {
    if (p.country !== spec.country) return false;
    // Baseline (`*`) rows always included; city-specific rows only if they match.
    return p.city === "*" || p.city.toLowerCase() === wantCity;
  });
}
