/**
 * Foto dei piatti.
 *
 * PERCHÉ QUESTO FILE È CAMBIATO
 * -----------------------------
 * Il prototipo usava `source.unsplash.com`, servizio che Unsplash ha
 * dismesso: verificato a settembre 2026, risponde `HTTP 503`. È il motivo per
 * cui nella demo del cliente *tutte* le immagini dei piatti risultano mancanti.
 *
 * Qui si usa LoremFlickr, che restituisce foto reali cercate per parola chiave
 * e non richiede alcuna chiave API — verificato funzionante, `HTTP 200`. Il
 * parametro `lock` rende l'immagine stabile: lo stesso piatto mostra sempre la
 * stessa foto, invece di cambiarne una a ogni ridisegno.
 *
 * IN PRODUZIONE
 * -------------
 * La scelta definitiva è Pexels, che ha foto migliori e diritti d'uso chiari,
 * ma richiede una chiave e quindi deve passare dal backend. Quando l'endpoint
 * sarà attivo basterà cambiare il corpo di questa funzione: la firma resta.
 *
 * Il nome del file resta `unsplash.ts` per non rompere i punti che lo
 * importano; il fornitore non è più quello.
 */

/** Parole che non aiutano a trovare una foto di cibo. */
const NOISE = new Set([
  "con", "e", "di", "del", "della", "al", "alla", "in", "the", "and", "with",
  "fresco", "fresca", "fatto", "casa", "stile", "ricetta",
]);

/** Somma stabile di una stringa: stesso piatto, stessa foto. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function unsplashFoodImage(query: string, seed = 0): string {
  const words = query
    .toLowerCase()
    .replace(/[^a-zà-ù0-9 ]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !NOISE.has(w))
    .slice(0, 2);

  // "food" resta sempre fra le parole chiave: senza, un piatto dal nome
  // ambiguo ("Farfalle", "Orecchiette") riporta immagini fuori tema.
  const keywords = [...words, "food"].join(",");
  const lock = (hash(query) + seed) % 10000;

  return `https://loremflickr.com/800/600/${encodeURIComponent(keywords)}?lock=${lock}`;
}
