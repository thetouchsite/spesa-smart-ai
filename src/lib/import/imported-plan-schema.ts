/**
 * Schema for a user-imported meal plan.
 *
 * Kept intentionally separate from `Plan` in models/plan-schema.ts because
 * the imported version:
 *   - is read-only (never mutated by the app)
 *   - carries `unparsed: true` flags on sections the AI couldn't read
 *   - has no cost/status/tips (those are derived downstream)
 */

import { z } from "zod";

export const ImportedIngredientSchema = z.object({
  name: z.string(),
  quantity: z.string(), // free-form "200 g", "1 cup", "to taste"
});

export const ImportedMealSchema = z.object({
  type: z.string(), // "breakfast" | "lunch" | "dinner" | "snack" | free-form
  name: z.string(), // "Chicken salad"
  ingredients: z.array(ImportedIngredientSchema),
  unparsed: z.boolean().default(false), // true when the parser gave up on this meal
  rawText: z.string().default(""), // original chunk for the user to edit
});

export const ImportedDaySchema = z.object({
  day: z.string(), // "Monday" or "Day 1"
  meals: z.array(ImportedMealSchema),
});

export const ImportedPlanSchema = z.object({
  days: z.array(ImportedDaySchema),
  notes: z.array(z.string()).default([]),
  language: z.string().default("en"),
});

export type ImportedIngredient = z.infer<typeof ImportedIngredientSchema>;
export type ImportedMeal = z.infer<typeof ImportedMealSchema>;
export type ImportedDay = z.infer<typeof ImportedDaySchema>;
export type ImportedPlan = z.infer<typeof ImportedPlanSchema>;

/** Meal patches keyed by `${dayIndex}:${mealIndex}` — never mutates original. */
export type MealPatches = Record<string, ImportedMeal>;
