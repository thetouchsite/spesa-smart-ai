/** Canonical Recipe shape used by the UI and every provider. */

export interface RecipeIngredient {
  name: string;
  quantity: string;
}

export interface RecipeNutrition {
  calories: number; // kcal per serving
  protein: number; // grams per serving
  carbs: number;
  fat: number;
}

export interface Recipe {
  id: string;
  title: string;
  /** Short evocative one-line description (chef enhancement). Optional. */
  description?: string;
  /** Image URL (provider image or Unsplash fallback). Always present. */
  image: string;
  servings: number;
  prepMinutes: number;
  cookMinutes: number;
  /** "easy" | "medium" | "hard" */
  difficulty: "easy" | "medium" | "hard";
  ingredients: RecipeIngredient[];
  steps: string[];
  nutrition: RecipeNutrition;
  allergens: string[];
  source: "themealdb" | "ai" | "fallback" | "web" | "web-ai" | "local" | "chef";
  sourceUrl?: string;
  sourceWebsite?: string;
  /** True when a chef-quality rewrite has been applied on top of the base recipe. */
  chefEnhanced?: boolean;
}
