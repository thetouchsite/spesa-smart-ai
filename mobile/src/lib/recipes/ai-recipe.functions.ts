/**
 * Ricetta generata dal modello — client dell'endpoint `POST /ai/recipe`.
 *
 * Nel prototipo era una server function TanStack che parlava direttamente con
 * il gateway Lovable. In React Native le server function non esistono e la
 * chiave non può stare nell'app, quindi la logica vive nel backend
 * (`server/src/index.ts`) e qui resta solo la chiamata.
 *
 * La firma è invariata — `generateAiRecipe({ data })` — così `recipes/index.ts`
 * non cambia di una riga.
 */

import { z } from "zod";
import { post } from "../../api/client";

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

export type AiRecipe = z.infer<typeof RecipeSchema>;

export interface AiRecipeArgs {
  dishName: string;
  mealType?: "breakfast" | "lunch" | "dinner" | "snack";
  servings?: number;
  language?: string;
  country?: string;
  city?: string;
  allergies?: string[];
  /** La spesa gia' fatta: la ricetta deve stare dentro questa. */
  dispensa?: string[];
  cuisine?: string;
}

export async function generateAiRecipe({ data }: { data: AiRecipeArgs }): Promise<AiRecipe> {
  const raw = await post<unknown>("/ai/recipe", data);
  // Il backend valida già in uscita, ma un modello può restituire una forma
  // inattesa: qui l'errore emerge sul confine della rete anziché più tardi,
  // dentro un componente, sotto forma di "undefined is not an object".
  return RecipeSchema.parse(raw);
}
