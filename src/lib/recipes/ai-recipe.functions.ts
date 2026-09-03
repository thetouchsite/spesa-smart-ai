/** AI-generated recipe fallback via Lovable AI Gateway. */
import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";

const Input = z.object({
  dishName: z.string().min(1),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).default("dinner"),
  servings: z.number().min(1).max(12).default(4),
  language: z.string().default("en"),
  country: z.string().default(""),
  city: z.string().default(""),
  allergies: z.array(z.string()).default([]),
  cuisine: z.string().optional(),
});

const RecipeSchema = z.object({
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

export const generateAiRecipe = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);
    const prompt = `Write a realistic ${data.mealType} recipe for "${data.dishName}".
${data.cuisine ? `Cuisine: ${data.cuisine}. Stay strictly within this culinary tradition.` : ""}
${data.country ? `Country context: this recipe is for a household in ${data.country}${data.city ? ` (${data.city})` : ""}. Adapt ingredients, brands, cuts, seasonings and cooking style to what is common, native and easily available in ${data.country}. Prefer dishes and preparations a local home cook would actually make.` : ""}
Servings: ${data.servings}.
CRITICAL LANGUAGE RULE: Write ALL text in language code "${data.language}" — the recipe title, ingredient names, step instructions and allergen labels. If the dish name "${data.dishName}" is in English, translate it naturally into ${data.language} (or replace it with the culturally equivalent local dish name in ${data.country || "the target country"}). NEVER emit any English text when the target language is not English.
Avoid these allergens/diets: ${data.allergies.join(", ") || "none"}.
Ingredients must be a complete, realistic list with metric quantities (g, ml, pcs). Provide 4-8 clear step-by-step instructions a home cook can follow. Provide approximate per-serving nutrition (kcal, protein g, carbs g, fat g) and any common allergens.`;
    const { experimental_output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      experimental_output: Output.object({ schema: RecipeSchema }),
      prompt,
    });
    return experimental_output;
  });

export type AiRecipe = z.infer<typeof RecipeSchema>;
