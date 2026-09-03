/** Local recipe database types — extends the canonical Recipe with cuisine
 *  and meal-type tagging for filtering. */
import type { Recipe, RecipeIngredient } from "../types";

export type LocalCuisine =
  | "Italian"
  | "Japanese"
  | "Family Budget"
  | "Low Carb"
  | "Mediterranean";

export type LocalMealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface LocalRecipe extends Recipe {
  cuisine: LocalCuisine;
  mealType: LocalMealType;
  /** Extra titles this recipe satisfies (e.g. "pizza" matching "Margherita Pizza"). */
  aliases?: string[];
}

export function r(input: {
  id: string;
  title: string;
  cuisine: LocalCuisine;
  mealType: LocalMealType;
  prepMinutes: number;
  cookMinutes: number;
  difficulty?: "easy" | "medium" | "hard";
  ingredients: RecipeIngredient[];
  steps: string[];
  nutrition?: { calories: number; protein: number; carbs: number; fat: number };
  allergens?: string[];
  imageQuery?: string;
  aliases?: string[];
}): LocalRecipe {
  const img = (input.imageQuery || input.title)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .replace(/\s+/g, ",");
  return {
    id: `local-${input.id}`,
    title: input.title,
    image: `https://source.unsplash.com/featured/800x600/?food,${encodeURIComponent(img)}`,
    servings: 4,
    prepMinutes: input.prepMinutes,
    cookMinutes: input.cookMinutes,
    difficulty: input.difficulty ?? "easy",
    ingredients: input.ingredients,
    steps: input.steps,
    nutrition: input.nutrition ?? { calories: 480, protein: 22, carbs: 55, fat: 16 },
    allergens: input.allergens ?? [],
    source: "themealdb", // treat local as a trusted source kind for the badge
    cuisine: input.cuisine,
    mealType: input.mealType,
    aliases: input.aliases,
  };
}
