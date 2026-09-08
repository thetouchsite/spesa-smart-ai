/**
 * Schemi di input/output degli endpoint AI.
 *
 * Ripresi alla lettera dalle server function TanStack del prototipo
 * (`plan.functions.ts`, `recipes/ai-recipe.functions.ts`,
 * `recipes/chef-enhance.functions.ts`, `recipes/google-recipe-search.ts`)
 * così il contratto verso il client resta identico: l'app mobile chiama
 * `POST /ai/<nome>` con lo stesso `data` che prima passava a `createServerFn`.
 *
 * L'app mobile importa gli stessi tipi, quindi una divergenza fra client e
 * server diventa un errore di compilazione invece che un bug in produzione.
 */

import { z } from "zod";

/* ─────────────────────────── Ricetta ─────────────────────────── */

export const RecipeSchema = z.object({
  title: z.string(),
  servings: z.number(),
  prepMinutes: z.number(),
  cookMinutes: z.number(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  ingredients: z.array(z.object({ name: z.string(), quantity: z.string() })),
  steps: z.array(z.string()),
  nutrition: z.object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
  }),
  allergens: z.array(z.string()),
});
export type AiRecipe = z.infer<typeof RecipeSchema>;

export const AiRecipeInput = z.object({
  dishName: z.string().min(1),
  /**
   * La lista della spesa del piano.
   *
   * Senza, la ricetta si inventa gli ingredienti: e' successo appena le
   * ricette sono state spostate su una chiamata separata dal menu'. Chi apriva
   * un piatto si trovava una ricetta che con la spesa fatta non poteva
   * cucinare — il difetto peggiore, perche' rompe la promessa dell'app.
   */
  dispensa: z.array(z.string().max(120)).max(40).default([]),

  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("dinner"),
  servings: z.number().min(1).max(12).default(4),
  language: z.string().default("en"),
  country: z.string().default(""),
  city: z.string().default(""),
  allergies: z.array(z.string()).default([]),
  cuisine: z.string().optional(),
});
export type AiRecipeInput = z.infer<typeof AiRecipeInput>;

/* ──────────────────── Ricetta estratta dal web ──────────────────── */

export const WebRecipeSchema = RecipeSchema.extend({
  sourceWebsite: z.string(),
  sourceUrl: z.string(),
  image: z.string(),
  cuisine: z.string(),
  extractionMode: z.enum(["extracted", "ai-assisted"]),
});
export type WebRecipe = z.infer<typeof WebRecipeSchema>;

export const WebRecipeInput = z.object({
  dishName: z.string().min(1),
  /**
   * La lista della spesa del piano.
   *
   * Senza, la ricetta si inventa gli ingredienti: e' successo appena le
   * ricette sono state spostate su una chiamata separata dal menu'. Chi apriva
   * un piatto si trovava una ricetta che con la spesa fatta non poteva
   * cucinare — il difetto peggiore, perche' rompe la promessa dell'app.
   */
  dispensa: z.array(z.string().max(120)).max(40).default([]),

  cuisine: z.string().optional(),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  servings: z.number().min(1).max(12).default(4),
  language: z.string().default("en"),
  country: z.string().default(""),
  city: z.string().default(""),
  allergies: z.array(z.string()).default([]),
});
export type WebRecipeInput = z.infer<typeof WebRecipeInput>;

/* ─────────────────────── Rifinitura "da chef" ─────────────────────── */

export const ChefInput = z.object({
  title: z.string().min(1),
  servings: z.number().min(1).max(24),
  prepMinutes: z.number().min(0).max(600).default(15),
  cookMinutes: z.number().min(0).max(600).default(20),
  difficulty: z.enum(["easy", "medium", "hard"]).default("easy"),
  ingredients: z.array(z.object({ name: z.string(), quantity: z.string() })),
  baseSteps: z.array(z.string()).default([]),
  cuisine: z.string().optional(),
  country: z.string().default(""),
  language: z.string().default("en"),
});
export type ChefInput = z.infer<typeof ChefInput>;

/**
 * Il modello può riscrivere SOLO questi campi. Ingredienti, porzioni,
 * valori nutrizionali e allergeni restano quelli della ricetta di partenza:
 * è il contratto che tiene allineati aggregatore spesa, motore prezzi e
 * calcolo del risparmio. Il client li riattacca dopo la risposta.
 */
export const ChefSchema = z.object({
  title: z.string(),
  description: z.string(),
  steps: z.array(z.string()),
  prepMinutes: z.number(),
  cookMinutes: z.number(),
  difficulty: z.enum(["easy", "medium", "hard"]),
});
export type ChefOutput = z.infer<typeof ChefSchema>;

/* ─────────────────────── Piano alimentare ─────────────────────── */

export const PlanInput = z.object({
  city: z.string().min(1),
  country: z.string().default(""),
  language: z.string().default("en"),
  household: z.string().min(1),
  budget: z.number().positive(),
  currency: z.string().min(3).max(3),
  frequency: z.enum(["weekly", "monthly"]),
  style: z.string().min(1),
  allergies: z.array(z.string()).default([]),
  dislikes: z.string().default(""),
});
export type PlanInput = z.infer<typeof PlanInput>;

export const PlanSchema = z.object({
  budgetAnalysis: z.string(),
  estimatedCost: z.number(),
  safetyMargin: z.number(),
  status: z.enum(["comfortable", "optimized", "critical", "too_low"]),
  recommendedBudget: z.number().nullable(),
  minimumBudget: z.number().nullable(),
  mealPlan: z.array(
    z.object({
      day: z.string(),
      breakfast: z.string(),
      lunch: z.string(),
      dinner: z.string(),
    }),
  ),
  groceryList: z.array(
    z.object({
      name: z.string(),
      quantity: z.string(),
      estimatedCost: z.number(),
      category: z.string(),
    }),
  ),
  savingTips: z.array(z.string()),
});
export type AiPlan = z.infer<typeof PlanSchema>;
