import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";

const PlanInput = z.object({
  city: z.string().min(1),
  country: z.string().default(""),
  language: z.string().default("en"),
  household: z.string().min(1),
  budget: z.number().positive(),
  currency: z.enum(["EUR", "GBP", "USD"]),
  frequency: z.enum(["weekly", "monthly"]),
  style: z.string().min(1),
  allergies: z.array(z.string()).default([]),
  dislikes: z.string().default(""),
});

const MealSchema = z.object({
  day: z.string(),
  breakfast: z.string(),
  lunch: z.string(),
  dinner: z.string(),
});

const GroceryItem = z.object({
  name: z.string(),
  quantity: z.string(),
  estimatedCost: z.number(),
  category: z.string(),
});

const PlanOutput = z.object({
  budgetAnalysis: z.string(),
  estimatedCost: z.number(),
  safetyMargin: z.number(),
  status: z.enum(["comfortable", "optimized", "critical", "too_low"]),
  recommendedBudget: z.number().nullable(),
  minimumBudget: z.number().nullable(),
  mealPlan: z.array(MealSchema),
  groceryList: z.array(GroceryItem),
  savingTips: z.array(z.string()),
});

export const generatePlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => PlanInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const { formatMoney } = await import("./country");
    const budgetDisplay = formatMoney(Number(data.budget) || 0, data.currency);
    const periodDays = data.frequency === "weekly" ? 7 : 30;

    const prompt = `You are a smart food budget planner for families. Generate a realistic, locally-priced food plan.

USER:
- Location: ${data.city}${data.country ? `, ${data.country}` : ""}
- Household size: ${data.household} people
- Budget: ${budgetDisplay} ${data.frequency}
- Food style: ${data.style}
- Allergies/diet: ${data.allergies.join(", ") || "none"}
- Dislikes: ${data.dislikes || "none"}

CRITICAL LANGUAGE RULE: Write ALL generated text — meal names (breakfast/lunch/dinner), grocery item names, categories, saving tips and budgetAnalysis — in language code "${data.language}". NEVER emit English text when the target language is not English.

${data.country ? `COUNTRY / CULTURAL RULE: this household is in ${data.country}. Generate meal names, dishes, cuts of meat, grocery items and brands that are native, common and easily bought in ${data.country}. Prefer local dishes families actually eat there (e.g. Italy → pasta e ceci, parmigiana, risotto; UK → shepherd's pie, jacket potato; Germany → Kartoffelsalat, Rouladen; France → boeuf bourguignon, ratatouille; Spain → tortilla, lentejas). Do not just translate English dish names.` : ""}

RULES:
- Use realistic local grocery prices for ${data.city}${data.country ? `, ${data.country}` : ""}.
- NEVER intentionally exceed the user budget. Keep a safety margin when possible.
- Generate a ${periodDays}-day meal plan (one entry per day).
- Status:
  - "comfortable" if estimatedCost <= 85% of budget
  - "optimized" if estimatedCost is 85-98% of budget
  - "critical" if estimatedCost is 98-100% of budget
  - "too_low" ONLY if a minimally nutritious plan for this household is impossible within budget. In that case provide recommendedBudget (comfortable) and minimumBudget (bare minimum).
- For non-too_low statuses, set recommendedBudget and minimumBudget to null.
- All monetary numbers must be in ${data.currency} (no symbols, plain numbers).
- safetyMargin = budget - estimatedCost.
- Provide a concise grocery list grouped logically by category (Produce, Proteins, Dairy, Pantry, etc.).
- Provide 3-5 short money-saving tips tailored to the user.
- budgetAnalysis: 1-2 sentence summary.`;

    const { experimental_output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      experimental_output: Output.object({ schema: PlanOutput }),
      prompt,
    });

    return experimental_output;
  });

export type Plan = z.infer<typeof PlanOutput>;
