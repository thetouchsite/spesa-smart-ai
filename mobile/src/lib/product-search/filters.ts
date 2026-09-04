/**
 * Sbarramenti sui risultati di Google Shopping.
 *
 * Modulo separato di proposito: `product-search/index.ts` tira dentro
 * l'orchestratore e, con lui, dipendenze di React Native. Questi filtri
 * servono anche altrove — alla schermata "prezzo reale" e agli script di
 * verifica — e devono restare eseguibili ovunque.
 *
 * PERCHÉ ESISTONO
 * ---------------
 * Cercando "Mushrooms" senza filtri tornavano: spawn per coltivare funghi a
 * 23 EUR, porcini secchi da 500 g a 57 EUR, integratori in capsule, e
 * venditori come "aruna kullu handloom". Il più economico risultava uno
 * shiitake da 6,95 EUR, che con i funghi del banco frigo non c'entra nulla.
 */

import { matchRetailerForCountry } from "./retailer-match";

/** Un prodotto da spesa sta in questa forbice. Fuori, non è quello cercato. */
export function isPlausibleUnitPrice(price: number): boolean {
  return Number.isFinite(price) && price > 0.2 && price < 60;
}

/** Parole che indicano che la riga NON è l'ingrediente: elettrodomestici,
 *  libri, cibo per animali, confezioni da ingrosso, cesti regalo, semi. */
const TITLE_BLOCKLIST = [
  "cooker", "steamer", "kettle", "blender", "microwave", "appliance",
  "cookbook", "recipe book", "book", "ebook",
  "pet food", "dog food", "cat food", "for dogs", "for cats", "puppy", "kitten",
  "toy", "poster", "sticker", "candle", "seed", "seeds", "plant",
  "wholesale", "catering", "bulk", "case of", "carton of", "pallet",
  "gift basket", "hamper",
];

/** Parole significative della ricerca, scartando quelle troppo corte. */
function contentTokens(q: string): string[] {
  return q.toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

/** Vero quando il titolo contiene TUTTE le parole cercate e nessuna
 *  parola della blocklist. Severo di proposito: un falso positivo manda
 *  l'utente su un prodotto sbagliato. */
export function titleMatchesQuery(title: string, query: string): boolean {
  const t = title.toLowerCase();
  if (TITLE_BLOCKLIST.some((bad) => t.includes(bad))) return false;
  const tokens = contentTokens(query);
  if (tokens.length === 0) return true;
  return tokens.every((tok) => t.includes(tok));
}

/**
 * Applica i tre sbarramenti, dal più economico al più costoso:
 *   1. prezzo fuori scala
 *   2. titolo che non corrisponde, o in blocklist
 *   3. venditore non riconosciuto per quel paese
 *
 * Il terzo è il più efficace ma anche il più severo: se scarta tutto si
 * mostrano le righe che hanno superato i primi due, perché una lista
 * imperfetta resta più utile di una vuota.
 */
export function filterShoppingRows<
  T extends { title: string; price: number | null; source: string },
>(rows: T[], query: string, country: string): T[] {
  const sane = rows.filter(
    (r) =>
      r.price != null &&
      isPlausibleUnitPrice(r.price) &&
      titleMatchesQuery(r.title || "", query),
  );

  const knownSellers = sane.filter((r) => !!matchRetailerForCountry(r.source, country));
  if (knownSellers.length > 0) return byPrice(knownSellers);

  // Nessuna catena riconosciuta. Si mostra comunque qualcosa, ma con un
  // vaglio più severo: cercando "Parmigiano" comparivano negozi di
  // esportazione — "Dolceterra U.S. Store", "Società Agricola Valserena" —
  // con confezioni regalo da 33 EUR. Prezzi da gastronomia, non da spesa.
  return byPrice(sane.filter((r) => !isSpecialistSeller(r.source) && (r.price ?? 0) <= 25));
}

/** Dal più economico: è l'ordine che l'utente si aspetta. */
function byPrice<T extends { price: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
}

/**
 * Venditori che non fanno la spesa quotidiana: esportatori, gastronomie,
 * aziende agricole che vendono confezioni regalo. I loro prezzi sono reali
 * ma non confrontabili con lo scaffale del supermercato.
 */
const SPECIALIST = [
  "u.s. store", "us store", "export", "gourmet", "delicatessen", "gastronomia",
  "azienda agricola", "societa agricola", "società agricola", "shop online",
  "boutique", "epicerie fine", "feinkost", "delicatessen", "specialit",
];

function isSpecialistSeller(source: string): boolean {
  const s = (source || "").toLowerCase();
  return SPECIALIST.some((w) => s.includes(w));
}
