/**
 * Ricerca prodotto su Google Shopping — client di `POST /product/shopping`.
 *
 * STATO: non attiva nel perimetro corrente.
 *
 * Il backend risponde `503` finché non è configurata una chiave SerpAPI, e
 * questo modulo restituisce `{ ok: false, reason: "not-configured" }` senza
 * propagare l'errore: `product-search/index.ts` ricade già sui link di
 * ricerca del negozio, che è il comportamento voluto.
 *
 * PERCHÉ NON È ATTIVA
 * -------------------
 * Si paga a ricerca e ogni prodotto del carrello è una ricerca. Un piano
 * contiene 30-40 prodotti; il piano SerpAPI da 25 $/mese copre 1.000 ricerche,
 * cioè ~28 piani al mese. Con 1.000 utenti che generano un piano a settimana
 * servono 160.000 ricerche mensili: oltre 1.400 $/mese di sole API.
 *
 * L'uso sensato è puntuale — «verifica il prezzo reale di QUESTO prodotto»,
 * su richiesta esplicita dell'utente — una ricerca invece di quaranta.
 */

import { post, ApiError } from "../../api/client";

export interface SerpShoppingItem {
  title: string;
  price: number | null;
  currency: string;
  /** Nome del venditore come lo riporta la fonte, usato da `matchRetailerForCountry`. */
  source: string;
  link: string;
  thumbnail: string;
}

export type SerpShoppingResult =
  | { ok: true; items: SerpShoppingItem[] }
  | { ok: false; reason: "not-configured" | "no-results" | "error" };

export interface ShoppingArgs {
  query: string;
  country?: string;
  limit?: number;
}

export async function searchGoogleShopping({
  data,
}: {
  data: ShoppingArgs;
}): Promise<SerpShoppingResult> {
  try {
    return await post<SerpShoppingResult>("/product/shopping", data);
  } catch (err) {
    // 503 = chiave non configurata: è lo stato previsto oggi, non un guasto.
    if (err instanceof ApiError && err.status === 503) {
      return { ok: false, reason: "not-configured" };
    }
    console.warn("[shopping] ricerca fallita:", err);
    return { ok: false, reason: "error" };
  }
}
