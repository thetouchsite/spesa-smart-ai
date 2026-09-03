/**
 * Rifinitura "da chef" — client dell'endpoint `POST /ai/chef`.
 *
 * Il modello può riscrivere SOLO titolo, descrizione, passaggi, tempi e
 * difficoltà. Ingredienti, porzioni e valori nutrizionali restano quelli
 * della ricetta di partenza: è il vincolo che tiene allineati aggregatore
 * della spesa, motore prezzi e calcolo del risparmio. Il vincolo è imposto
 * nel prompt lato backend e, qui, dallo schema di risposta che semplicemente
 * non contiene quei campi.
 */

import { z } from "zod";
import { post } from "../../api/client";

const ChefOut = z.object({
  title: z.string(),
  description: z.string(),
  steps: z.array(z.string()),
  prepMinutes: z.number(),
  cookMinutes: z.number(),
  difficulty: z.enum(["easy", "medium", "hard"]),
});

export type ChefEnhancement = z.infer<typeof ChefOut>;

export interface ChefArgs {
  title: string;
  servings: number;
  prepMinutes?: number;
  cookMinutes?: number;
  difficulty?: "easy" | "medium" | "hard";
  ingredients: Array<{ name: string; quantity: string }>;
  baseSteps?: string[];
  cuisine?: string;
  country?: string;
  language?: string;
}

export async function enhanceRecipeAsChef({
  data,
}: {
  data: ChefArgs;
}): Promise<ChefEnhancement> {
  const raw = await post<unknown>("/ai/chef", data);
  return ChefOut.parse(raw);
}
