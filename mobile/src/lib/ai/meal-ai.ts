/**
 * Public AI service. UI imports `generateMealPlanWithAI()`; the actual
 * provider (mock today, real AI tomorrow) is selected internally.
 *
 * After meal-name generation, this layer also enriches the plan by resolving
 * a real Recipe for every meal slot and rebuilding the grocery list from
 * the merged recipe ingredients. This is what makes the grocery list
 * RECIPE-DRIVEN — every row traces back to one or more cooked meals.
 */

import type { UserProfile } from "@/lib/models";
import type { Plan } from "@/lib/models/plan-schema";
import { mockAIProvider, type AIMealPlanInput } from "./mock-provider";
import { realAIProvider, REAL_AI_ENABLED } from "./real-provider";
import { getRecipe } from "@/lib/recipes";
import { buildDeterministicRecipe } from "@/lib/recipes/deterministic-recipe";
import { aggregateRecipesToGrocery } from "@/lib/recipes/aggregate";
import { cuisineForStyle } from "@/lib/recipes/local-db";
import { getMealPool } from "@/lib/meal-engine/style-catalog";
import { tierFor } from "@/lib/meal-engine/tiers";
import { generateMealPlan } from "@/lib/meal-engine";

function parseHousehold(h: string): number {
  return Math.max(1, parseInt((h || "4").replace("+", ""), 10) || 4);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  return Promise.race([promise, timer]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function safeBasePlan(input: AIMealPlanInput): Promise<Plan> {
  try {
    return REAL_AI_ENABLED
      ? await withTimeout(realAIProvider(input), 8_000, "real meal provider")
      : await mockAIProvider(input);
  } catch (err) {
    console.warn("[meal-ai] provider failed; using deterministic fallback:", err);
    try {
      return await mockAIProvider(input);
    } catch (fallbackErr) {
      console.warn("[meal-ai] mock provider failed; using pure meal engine fallback:", fallbackErr);
      return generateMealPlan({
        profile: input.profile,
        seed: input.seed,
        quantityScale: input.quantityScale,
      }).plan;
    }
  }
}

export async function enrichWithRecipes(
  plan: Plan,
  profile: UserProfile,
  language: string,
): Promise<Plan> {
  const household = parseHousehold(profile.household);
  const cuisine = cuisineForStyle(profile.style);
  const periodScale = profile.frequency === "monthly" ? 30 / 7 : 1;

  // Collect every meal slot, skipping Zero-Spend-Day placeholders.
  type Slot = { name: string; mealType: "breakfast" | "lunch" | "dinner"; dayIndex: number };
  const slots: Slot[] = [];
  plan.mealPlan.forEach((m, dayIndex) => {
    if (!/zero spend|leftovers reheated|pantry/i.test(m.dinner)) {
      slots.push({ name: m.breakfast, mealType: "breakfast", dayIndex });
      slots.push({ name: m.lunch, mealType: "lunch", dayIndex });
      slots.push({ name: m.dinner, mealType: "dinner", dayIndex });
    }
  });

  // Resolve recipes in parallel, but never let one slow provider keep the user
  // trapped on the processing screen. Every slot receives a recipe-specific
  // deterministic fallback, so the basket stays tied to selected meals instead
  // of reverting to the meal-engine's generic template grocery basket.
  const recipes = await Promise.all(
    slots.map((s) =>
      withTimeout(
        getRecipe(s.name, {
          servings: household,
          language,
          country: profile.country,
          city: profile.city,
          mealType: s.mealType,
          allergies: profile.allergies,
          style: profile.style,
        }),
        12_000,
        `recipe ${s.name}`,
      ).catch((err) => {
        console.warn("[meal-ai] recipe slot fallback:", s.name, err);
        return buildDeterministicRecipe(s.name, {
          servings: household,
          mealType: s.mealType,
          language,
        });
      }),
    ),
  );
  const valid = recipes.filter((r): r is NonNullable<typeof r> => !!r && r.ingredients.length > 0);
  if (valid.length === 0) return { ...plan, groceryList: [] };

  // When the user's language isn't English, overwrite the plan's meal names
  // with the localized recipe titles so day cards no longer show English text.
  let mealPlan = plan.mealPlan;
  if (language && language !== "en") {
    mealPlan = plan.mealPlan.map((m) => ({ ...m }));
    slots.forEach((slot, i) => {
      const r = recipes[i];
      if (r && r.title && r.title.trim()) {
        mealPlan[slot.dayIndex][slot.mealType] = r.title;
      }
    });
  }

  const newGrocery = aggregateRecipesToGrocery(valid, { servingsScale: periodScale });
  if (newGrocery.length === 0) return { ...plan, mealPlan, groceryList: [] };

  return { ...plan, mealPlan, groceryList: newGrocery };
}



export async function generateMealPlanWithAI(
  profile: UserProfile,
  seed = 1,
  opts: { quantityScale?: number; language?: string } = {},
): Promise<Plan> {
  const input: AIMealPlanInput = {
    profile,
    seed,
    quantityScale: opts.quantityScale,
    language: opts.language,
  };
  const lang = opts.language ?? "en";
  const basePlan = await safeBasePlan(input);
  // Enrich with recipe ingredients. Do not wrap this in a whole-plan timeout:
  // each slot already has a per-recipe timeout and deterministic fallback, and
  // returning the base plan would reintroduce the generic template basket.
  try {
    return await enrichWithRecipes(basePlan, profile, lang);
  } catch (err) {
    console.warn("[meal-ai] recipe enrichment failed; returning empty recipe basket:", err);
    return { ...basePlan, groceryList: [] };
  }
}

/** Pick an alternative meal name from the user's cuisine+tier pool that
 *  differs from the current dish. Used by the recipe modal's "Swap meal". */
export function pickAlternativeMeal(
  profile: UserProfile,
  mealType: "breakfast" | "lunch" | "dinner",
  currentName: string,
): string {
  const tier = tierFor(Number(profile.budget) || 100, parseHousehold(profile.household), profile.frequency);
  const pool = getMealPool(profile.style, tier)[mealType] ?? [];
  const others = pool.filter((n) => n.toLowerCase() !== currentName.toLowerCase());
  if (others.length === 0) return currentName;
  return others[Math.floor(Math.random() * others.length)];
}

/** Replace one meal slot in the plan and rebuild the grocery list. */
export async function swapMealSlot(
  plan: Plan,
  profile: UserProfile,
  dayIndex: number,
  mealType: "breakfast" | "lunch" | "dinner",
  newName: string,
  language = "en",
): Promise<Plan> {
  const mealPlan = plan.mealPlan.map((m, i) => (i === dayIndex ? { ...m, [mealType]: newName } : m));
  return enrichWithRecipes({ ...plan, mealPlan }, profile, language);
}
