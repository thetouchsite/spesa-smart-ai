/**
 * Canonical Plan schema — shared by the meal engine, the mock AI provider,
 * the future real AI provider, and the storage layer.
 *
 * Anywhere a `Plan` crosses a boundary (network, storage, AI gateway), it
 * MUST validate against this schema. Keeps the prototype and the eventual
 * real AI/DB integration interchangeable.
 */

import { z } from "zod";

export const MealSchema = z.object({
  day: z.string(),
  breakfast: z.string(),
  lunch: z.string(),
  dinner: z.string(),
});

export const GroceryItemSchema = z.object({
  name: z.string(),
  quantity: z.string(),
  /** Always derived from the Price Engine — engines must return 0 here. */
  estimatedCost: z.number().min(0),
  category: z.string(),
});

export const PlanSchema = z.object({
  budgetAnalysis: z.string(),
  estimatedCost: z.number(),
  safetyMargin: z.number(),
  status: z.enum(["comfortable", "optimized", "critical", "too_low"]),
  recommendedBudget: z.number().nullable(),
  minimumBudget: z.number().nullable(),
  mealPlan: z.array(MealSchema),
  groceryList: z.array(GroceryItemSchema),
  savingTips: z.array(z.string()),
});

export type Plan = z.infer<typeof PlanSchema>;
export type Meal = z.infer<typeof MealSchema>;
export type GroceryItem = z.infer<typeof GroceryItemSchema>;
