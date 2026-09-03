/** Chef AI Enhancement.
 *
 *  Takes a base recipe (from the local DB, web extraction, or the AI
 *  fallback) and rewrites ONLY its culinary experience — title,
 *  description, cooking instructions, timing, seasoning cues, plating —
 *  as if a Michelin-trained private chef were guiding a home cook.
 *
 *  HARD CONTRACT
 *  -------------
 *  This step MUST NOT change:
 *    - the ingredient array (names + quantities, byte-identical)
 *    - servings
 *    - nutrition (calories/protein/carbs/fat per serving)
 *    - allergens
 *
 *  The orchestrator enforces this by DISCARDING anything the model
 *  returns for those fields and re-attaching the original values. That
 *  guarantees the grocery aggregator, pricing engine, and savings
 *  calculation see exactly the same inputs as before enhancement. */

import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";

const IngredientIn = z.object({ name: z.string(), quantity: z.string() });

const Input = z.object({
  title: z.string().min(1),
  servings: z.number().min(1).max(24),
  prepMinutes: z.number().min(0).max(600).default(15),
  cookMinutes: z.number().min(0).max(600).default(20),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  ingredients: z.array(IngredientIn).min(1),
  baseSteps: z.array(z.string()).default([]),
  cuisine: z.string().optional(),
  country: z.string().default(""),
  language: z.string().default("en"),
});

/** Model returns ONLY the culinary experience fields. Ingredients,
 *  nutrition and allergens are intentionally NOT in this schema so the
 *  model cannot mutate them even by accident. */
const ChefOut = z.object({
  title: z.string(),
  description: z.string(),
  steps: z.array(z.string()).min(3).max(12),
  prepMinutes: z.number().min(0).max(600),
  cookMinutes: z.number().min(0).max(600),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export type ChefEnhancement = z.infer<typeof ChefOut>;

export const enhanceRecipeAsChef = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<ChefEnhancement> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const ingredientBlock = data.ingredients
      .map((i) => `- ${i.quantity} ${i.name}`)
      .join("\n");

    const baseStepsBlock = data.baseSteps.length
      ? data.baseSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")
      : "(no base steps — write the method from scratch for the ingredients above)";

    const prompt = `You are a Michelin-trained private chef writing for a home cook.

Rewrite the cooking experience of an existing recipe so it feels crafted,
precise and delicious — while staying achievable in a normal home kitchen.

STRICT RULES — VIOLATION IS A FAILURE:
1. Do NOT invent, add, remove, rename or resize any ingredient.
   The ingredient list is fixed and will be re-attached by the caller.
2. Do NOT change servings, nutrition, or allergens.
3. You may only improve: title, one-line description, cooking method,
   timing, seasoning cues, technique, resting, flavour layering, plating.
4. Write ALL output in language code "${data.language}". If the original
   title is in another language, translate it naturally (or use the local
   dish name a home cook in ${data.country || "the target country"} would recognise).
5. Steps: 4-8 short paragraphs. Each step tells the cook WHAT to do, the
   sensory cue to look for (colour, aroma, sound, texture) and the WHY
   behind it in one clause. Include exact temperatures (Celsius), pan
   choice, resting and seasoning timing. No fluff, no "enjoy!", no marketing.
6. Description: one sentence, max 140 chars, evocative but honest.
7. Difficulty: only raise above the base if a real technique demands it;
   otherwise keep or lower it — home cooks must succeed.

CONTEXT
Cuisine: ${data.cuisine || "unspecified"}
Country: ${data.country || "unspecified"}
Servings: ${data.servings}
Base prep: ${data.prepMinutes} min. Base cook: ${data.cookMinutes} min. Base difficulty: ${data.difficulty}

ORIGINAL TITLE
${data.title}

FIXED INGREDIENTS (do not modify)
${ingredientBlock}

BASE STEPS (rewrite, do not just copy)
${baseStepsBlock}

Return the chef-quality title, description, steps and adjusted timing/difficulty.`;

    const { experimental_output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      experimental_output: Output.object({ schema: ChefOut }),
      prompt,
    });
    return experimental_output;
  });
