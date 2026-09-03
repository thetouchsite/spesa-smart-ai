/**
 * Import del piano del nutrizionista — client di `POST /ai/import`.
 *
 * L'utente fotografa o incolla un piano alimentare e il modello lo converte
 * in un `ImportedPlan` strutturato. La logica sta nel backend perché richiede
 * la chiave Gemini; qui resta la chiamata, con la firma del prototipo intatta.
 */

import { post } from "../../api/client";
import { ImportedPlanSchema, type ImportedPlan } from "./imported-plan-schema";

export interface ParsePlanArgs {
  /** Testo incollato, oppure immagine in base64 con il suo tipo MIME. */
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
  language?: string;
}

export async function parseImportedPlan({
  data,
}: {
  data: ParsePlanArgs;
}): Promise<ImportedPlan> {
  const raw = await post<unknown>("/ai/import", data);
  return ImportedPlanSchema.parse(raw);
}
