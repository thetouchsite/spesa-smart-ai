/**
 * Ricetta dal web — client dell'endpoint `POST /ai/recipe-web`.
 *
 * Nel prototipo questo file conteneva anche lo scraping di DuckDuckGo e la
 * lettura delle pagine. Entrambi sono passati al backend (`server/src/search.ts`),
 * dove hanno accesso alla rete senza i limiti CORS di un'app e dove il
 * fornitore di ricerca è sostituibile senza ripubblicare l'app.
 *
 * ONESTÀ DEL RISULTATO
 * --------------------
 * `extractionMode` dice come è nata la ricetta:
 *   "extracted"   → una pagina reale è stata letta, `sourceUrl` porta lì
 *   "ai-assisted" → nessuna pagina leggibile, ricetta generata, `sourceUrl` ""
 *
 * Il prototipo, nel secondo caso, riportava comunque l'URL del primo risultato
 * di ricerca: l'utente cliccava e trovava un'altra ricetta. L'interfaccia deve
 * usare questo campo per etichettare la fonte, non darla per scontata.
 */

import { z } from "zod";
import { post } from "../../api/client";

const RecipeOut = z.object({
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
  sourceWebsite: z.string(),
  sourceUrl: z.string(),
  image: z.string(),
  cuisine: z.string(),
  extractionMode: z.enum(["extracted", "ai-assisted"]),
});

export type GoogleRecipeResult = z.infer<typeof RecipeOut>;

export interface WebRecipeArgs {
  dishName: string;
  cuisine?: string;
  mealType?: "breakfast" | "lunch" | "dinner" | "snack";
  servings?: number;
  language?: string;
  country?: string;
  city?: string;
  allergies?: string[];
}

export async function searchGoogleRecipe({
  data,
}: {
  data: WebRecipeArgs;
}): Promise<GoogleRecipeResult> {
  const raw = await post<unknown>("/ai/recipe-web", data);
  return RecipeOut.parse(raw);
}

/** True quando la ricetta proviene davvero da una pagina consultabile. */
export function hasRealSource(recipe: GoogleRecipeResult): boolean {
  return recipe.extractionMode === "extracted" && recipe.sourceUrl.length > 0;
}
