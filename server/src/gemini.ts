/**
 * Client Gemini diretto — sostituisce il gateway Lovable.
 *
 * PRIMA:  app → https://ai.gateway.lovable.dev/v1 (header Lovable-API-Key)
 * ADESSO: app → questo backend → Google Generative AI (header x-goog-api-key)
 *
 * Il gateway Lovable era l'ultima dipendenza runtime dalla piattaforma. Ora
 * l'unica chiave necessaria è `GOOGLE_GENERATIVE_AI_API_KEY`, ottenibile da
 * Google AI Studio, e il fornitore è sostituibile cambiando questo file
 * soltanto: ogni handler riceve `model()` e non sa quale provider ci sia sotto.
 *
 * Costi (settembre 2026, Gemini 3 Flash): 0,25 $ / 1M token in ingresso,
 * 1,50 $ / 1M in uscita. Prezzo introduttivo: verificare dopo il 31/12/2026.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";

/** Modello unico usato da tutti gli endpoint. Cambiarlo qui li cambia tutti. */
export const MODEL_ID = process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";

let cached: ReturnType<typeof createGoogleGenerativeAI> | null = null;

/**
 * Su Railway le variabili d'ambiente sono disponibili all'avvio, ma la lettura
 * resta dentro la funzione per restare compatibili con i runtime che le legano
 * per-richiesta (Cloudflare Workers, Deno Deploy) se un domani si cambia host.
 */
function provider() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GENERATIVE_AI_API_KEY non configurata. " +
        "Ottienila su https://aistudio.google.com/apikey e impostala fra le variabili del servizio.",
    );
  }
  if (!cached) cached = createGoogleGenerativeAI({ apiKey });
  return cached;
}

/** Il modello da passare a `generateText`. */
export function model() {
  return provider()(MODEL_ID);
}

/** True quando la chiave è configurata — usato da /health per non mentire. */
export function isConfigured(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}
