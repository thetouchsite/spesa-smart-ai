/** Local recipe database — strong cuisine-tagged fallbacks so the app
 *  always returns a full recipe even when external APIs miss. */
import { ITALIAN } from "./italian";
import { JAPANESE } from "./japanese";
import { FAMILY_BUDGET } from "./family-budget";
import { LOW_CARB } from "./low-carb";
import { MEDITERRANEAN } from "./mediterranean";
import type { LocalCuisine, LocalMealType, LocalRecipe } from "./types";
import type { Recipe } from "../types";

export type { LocalCuisine, LocalMealType, LocalRecipe } from "./types";

export const ALL_LOCAL: LocalRecipe[] = [
  ...ITALIAN,
  ...JAPANESE,
  ...FAMILY_BUDGET,
  ...LOW_CARB,
  ...MEDITERRANEAN,
];

/** Map the UI's style label to a local cuisine bucket. */
export function cuisineForStyle(style: string): LocalCuisine | null {
  switch (style) {
    case "Italian":
    case "Mediterranean":
      return style;
    case "Japanese Inspired":
      return "Japanese";
    case "Low Carb":
      return "Low Carb";
    case "Family Budget":
    case "Healthy Lifestyle":
      return style === "Family Budget" ? "Family Budget" : null;
    default:
      return null;
  }
}

function matchScore(needle: string, hay: string): number {
  const n = needle.toLowerCase().trim();
  const h = hay.toLowerCase().trim();
  if (!n || !h) return 0;
  if (n === h) return 1000;
  const nTokens = n.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const hTokensRaw = h.split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  const hTokens = new Set(hTokensRaw);
  if (nTokens.length >= 2 && h.includes(n)) return 700;
  if (hTokensRaw.length >= 2 && n.includes(h)) return 650;
  let score = 0;
  for (const t of nTokens) if (hTokens.has(t)) score += 50;
  const overlap = score / 50;
  const required = Math.max(2, Math.ceil(nTokens.length * 0.55));
  if (overlap < required) return 0;
  return score;
}

/** Find the best local recipe for a dish name. Cuisine biases the match
 *  but does not restrict — a "Pizza Margherita" still wins for "Pizza"
 *  regardless of selected style. */
export function findLocalRecipe(
  dishName: string,
  opts: { cuisine?: LocalCuisine | null; mealType?: LocalMealType } = {},
): Recipe | null {
  if (!dishName) return null;
  let best: { r: LocalRecipe; score: number } | null = null;
  for (const candidate of ALL_LOCAL) {
    const titleScore = matchScore(dishName, candidate.title);
    const aliasScore = Math.max(
      0,
      ...(candidate.aliases ?? []).map((a) => matchScore(dishName, a) * 0.9),
    );
    let score = Math.max(titleScore, aliasScore);
    if (score < 50) continue;
    if (opts.cuisine && candidate.cuisine === opts.cuisine) score += 200;
    if (opts.mealType && candidate.mealType === opts.mealType) score += 60;
    if (!best || score > best.score) best = { r: candidate, score };
  }
  if (!best) return null;
  // Strip extra fields → canonical Recipe.
  const { cuisine: _c, mealType: _m, aliases: _a, ...recipe } = best.r;
  return recipe;
}

/** Pick the Nth recipe of a cuisine+mealType bucket (round-robin), so the
 *  meal-engine can seed deterministic plans from local titles. */
export function pickLocalByIndex(
  cuisine: LocalCuisine,
  mealType: LocalMealType,
  index: number,
): LocalRecipe | null {
  const pool = ALL_LOCAL.filter((r) => r.cuisine === cuisine && r.mealType === mealType);
  if (pool.length === 0) return null;
  return pool[((index % pool.length) + pool.length) % pool.length];
}

/** All titles in a cuisine for a given meal type — used to seed meal pools. */
export function titlesForCuisine(cuisine: LocalCuisine, mealType: LocalMealType): string[] {
  return ALL_LOCAL.filter((r) => r.cuisine === cuisine && r.mealType === mealType).map((r) => r.title);
}
