/**
 * Ricerca prodotto su Google Shopping, tramite SerpAPI.
 *
 * È l'unica fonte del progetto che restituisce prezzo REALE, venditore reale
 * e link al prodotto. Tutto il resto sono stime.
 *
 * COSTO, CHE QUI DECIDE L'ARCHITETTURA
 * ------------------------------------
 * Si paga a ricerca. Il piano gratuito dà 250 ricerche al mese, il primo
 * scalino 1.000 per 25 $. Una lista della spesa contiene 30-40 prodotti:
 * valorizzarla tutta consumerebbe la quota gratuita in sette liste.
 *
 * Per questo la ricerca parte SOLO su richiesta esplicita dell'utente — un
 * prodotto alla volta, quando tocca la riga — e ogni risultato finisce in
 * cache condivisa. Due persone che cercano "passata di pomodoro" consumano
 * una ricerca sola.
 *
 * Il codice paese e la lingua vengono passati a Google: senza, una ricerca
 * italiana torna con risultati americani in dollari.
 */

import { HttpError } from "../base/http.js";

export interface ShoppingItem {
  title: string;
  price: number | null;
  currency: string;
  /** Nome del venditore come lo riporta Google. */
  source: string;
  link: string;
  thumbnail: string;
}

export type ShoppingResult =
  | { ok: true; items: ShoppingItem[] }
  | { ok: false; reason: "not-configured" | "no-results" | "error" };

/** Da codice paese ISO a valuta, per etichettare i prezzi correttamente. */
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  IT: "EUR", FR: "EUR", ES: "EUR", DE: "EUR", NL: "EUR", PT: "EUR", IE: "EUR",
  GB: "GBP", US: "USD", CH: "CHF", JP: "JPY", BR: "BRL", AE: "AED",
};

export function isShoppingConfigured(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

/**
 * Estrae il valore numerico dal prezzo.
 *
 * SerpAPI fornisce `extracted_price` già numerico quando riesce a leggerlo;
 * quando manca si prova a interpretare la stringa, che in Italia usa la
 * virgola come separatore decimale ("1,39 €").
 */
function parsePrice(row: Record<string, unknown>): number | null {
  const extracted = row.extracted_price;
  if (typeof extracted === "number" && Number.isFinite(extracted)) return extracted;

  const raw = typeof row.price === "string" ? row.price : "";
  const cleaned = raw.replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

export async function searchShopping(
  query: string,
  country = "IT",
  limit = 6,
): Promise<ShoppingResult> {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { ok: false, reason: "not-configured" };

  const cc = (country || "IT").toUpperCase().slice(0, 2);
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("gl", cc.toLowerCase());
  url.searchParams.set("hl", cc === "IT" ? "it" : "en");
  url.searchParams.set("num", String(Math.min(20, limit * 3)));
  url.searchParams.set("api_key", key);

  try {
    // Trenta secondi e non quindici: lanciando otto ricerche insieme, SerpAPI
    // le mette in coda e le ultime tornano tardi. Con quindici ne scadevano
    // sei su diciotto — un terzo dei prodotti restava senza prezzo, e la
    // ricerca era gia' stata pagata lo stesso.
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (res.status === 401 || res.status === 403) {
      throw new HttpError(503, "Chiave SerpAPI non valida o quota esaurita");
    }
    if (!res.ok) {
      console.warn(`[shopping] HTTP ${res.status}`);
      return { ok: false, reason: "error" };
    }

    const json = (await res.json()) as {
      error?: string;
      shopping_results?: Array<Record<string, unknown>>;
    };

    // SerpAPI segnala l'esaurimento della quota nel corpo, con HTTP 200.
    if (json.error) {
      console.warn("[shopping] SerpAPI:", json.error);
      return { ok: false, reason: /run out|limit/i.test(json.error) ? "not-configured" : "error" };
    }

    const rows = json.shopping_results ?? [];
    if (rows.length === 0) return { ok: false, reason: "no-results" };

    const items: ShoppingItem[] = rows
      .slice(0, limit)
      .map((r) => ({
        title: String(r.title ?? ""),
        price: parsePrice(r),
        currency: CURRENCY_BY_COUNTRY[cc] ?? "EUR",
        source: String(r.source ?? ""),
        link: String(r.product_link ?? r.link ?? ""),
        thumbnail: String(r.thumbnail ?? r.serpapi_thumbnail ?? ""),
      }))
      // Una riga senza prezzo o senza link non serve a chi vuole comprare.
      .filter((i) => i.title && (i.price !== null || i.link));

    return items.length > 0 ? { ok: true, items } : { ok: false, reason: "no-results" };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.warn("[shopping] ricerca fallita:", err);
    return { ok: false, reason: "error" };
  }
}
