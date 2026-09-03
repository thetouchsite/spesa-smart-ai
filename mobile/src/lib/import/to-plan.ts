/**
 * Adapter: (ImportedPlan + patches) → shopping-ready shape.
 *
 * Uses the existing recipe → grocery aggregator so pricing/comparison/
 * savings math is IDENTICAL to the "Create a Smart Meal Plan" flow.
 * The imported plan itself is never mutated — we merge base + patches
 * into a temporary object that flows downstream.
 */

import { aggregateRecipesToGrocery } from "@/lib/recipes/aggregate";
import type { Recipe } from "@/lib/recipes/types";
import type { ImportedPlan, MealPatches, ImportedMeal } from "./imported-plan-schema";

export function mergePatches(base: ImportedPlan, patches: MealPatches): ImportedPlan {
  return {
    ...base,
    days: base.days.map((d, di) => ({
      ...d,
      meals: d.meals.map((m, mi) => patches[`${di}:${mi}`] ?? m),
    })),
  };
}

function mealToRecipe(m: ImportedMeal, id: string): Recipe {
  return {
    id,
    title: m.name || m.type || "Meal",
    image: "",
    servings: 4,
    prepMinutes: 0,
    cookMinutes: 0,
    difficulty: "easy",
    ingredients: m.ingredients.filter((i) => i.name.trim()),
    steps: [],
    nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    allergens: [],
    source: "web",
  };
}

export function importedPlanToRecipes(plan: ImportedPlan): Recipe[] {
  const out: Recipe[] = [];
  plan.days.forEach((d, di) => {
    d.meals.forEach((m, mi) => {
      if (m.unparsed || m.ingredients.length === 0) return;
      out.push(mealToRecipe(m, `${di}-${mi}`));
    });
  });
  return out;
}

export function importedPlanStats(plan: ImportedPlan) {
  const mealCount = plan.days.reduce((sum, d) => sum + d.meals.length, 0);
  const missing = plan.days.reduce(
    (sum, d) => sum + d.meals.filter((m) => m.unparsed).length,
    0,
  );
  return { days: plan.days.length, meals: mealCount, missing };
}

export function buildGroceryFromImported(
  plan: ImportedPlan,
  household: number,
  frequency: "weekly" | "monthly",
) {
  const recipes = importedPlanToRecipes(plan);
  const servingsScale = (household / 4) * (frequency === "monthly" ? 30 / 7 : 1);
  return aggregateRecipesToGrocery(recipes, { servingsScale });
}
