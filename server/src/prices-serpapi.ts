/**
 * La seconda strada: prezzare la lista con Google Shopping.
 *
 * Esiste per poter confrontare, non perché sia meglio. Le due vie hanno
 * difetti opposti e conviene poterle guardare una accanto all'altra prima di
 * decidere cosa promettere al cliente.
 *
 *   AI CON RICERCA     cerca lo STESSO prodotto della lista nei supermercati
 *                      della città, e il server apre ogni pagina per
 *                      controllarla. Copertura 60-85%, circa 0,04 $ a piano.
 *
 *   GOOGLE SHOPPING    trova quasi sempre qualcosa, ma sono i venditori del
 *                      marketplace: per «filetti di merluzzo» ha proposto un
 *                      barattolino Amazon da 105 g accanto a un surgelato
 *                      svizzero da 19,95 — prezzi veri di prodotti sbagliati.
 *                      Copertura alta, pertinenza bassa.
 *
 * IL COSTO QUI DECIDE TUTTO
 * -------------------------
 * SerpAPI si paga a ricerca: il piano gratuito ne dà 250 al mese. Prezzare
 * una lista intera ne consuma una per prodotto, cioè 15-20 a piano: con la
 * chiave gratuita si arriva a **una dozzina di piani al mese**, poi si ferma.
 *
 * Per questo il prototipo del cliente cercava un prodotto alla volta, al
 * tocco. Prezzare tutto insieme dà il totale che il prototipo si aspettava,
 * ma brucia la quota — quindi questa strada resta dietro un interruttore,
 * spento salvo quando la si vuole provare.
 */

import { searchShopping, type ShoppingItem } from "./shopping.js";

/** Una riga di prezzo, nella stessa forma che produce il motore AI. */
export interface SerpPriceRow {
  prodotto: string;
  nome: string;
  prezzo: number | null;
  valuta: string;
  negozio: string;
  link: string;
  /**
   * Miniatura del prodotto.
   *
   * Google Shopping la restituisce e l'app la mostrava gia': una foto accanto
   * al prezzo dice a colpo d'occhio se il risultato e' il prodotto giusto —
   * cosa che con questa fonte capita di dover verificare.
   */
  immagine?: string;
}

/**
 * Venditori da non proporre per la spesa alimentare.
 *
 * Non è snobismo: su Google Shopping le prime posizioni per «passata di
 * pomodoro» sono spesso negozi di specialità italiane all'estero, che la
 * vendono a cinque volte il prezzo del supermercato. Un prezzo vero, di un
 * prodotto vero, che però non c'entra niente con la spesa di tutti i giorni.
 */
const VENDITORI_DA_EVITARE = [
  "ebay", "wish", "aliexpress", "alibaba", "etsy", "temu",
  "gourmet", "delicatessen", "specialit", "export", "italian food",
  "vinicola", "enoteca", "farmacia", "parafarmacia", "erboristeria",
];

/** Parole che segnalano un prodotto che non è quello cercato. */
const TITOLI_DA_EVITARE = [
  "integratore", "capsule", "compresse", "in polvere",
  "cartone da", "confezione da 12", "confezione da 24", "all'ingrosso",
  "per animali", "gatti", "cani",
];

/**
 * Sopravvive solo ciò che ha l'aria di un prodotto da supermercato.
 *
 * Gli stessi sbarramenti che il prototipo applicava lato app, portati qui
 * perché servono a entrambe le strade e in un posto solo si correggono una
 * volta sola.
 */
function plausibile(item: ShoppingItem, query: string): boolean {
  if (item.price == null) return false;
  // Sopra i 25 € non è spesa quotidiana: è un cartone o un regalo gastronomico.
  if (item.price < 0.2 || item.price > 25) return false;

  const venditore = (item.source ?? "").toLowerCase();
  if (VENDITORI_DA_EVITARE.some((v) => venditore.includes(v))) return false;

  const titolo = (item.title ?? "").toLowerCase();
  if (TITOLI_DA_EVITARE.some((v) => titolo.includes(v))) return false;

  // Il titolo deve contenere almeno una parola significativa della ricerca,
  // altrimenti Google ha risposto a un'altra domanda.
  const parole = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  if (parole.length && !parole.some((w) => titolo.includes(w))) return false;

  return true;
}

export interface SerpPricesResult {
  prezzi: SerpPriceRow[];
  /** Ricerche effettivamente inviate a SerpAPI: è la quota consumata. */
  ricerche: number;
  /** Prodotti per cui non è arrivato nulla di utilizzabile. */
  senzaPrezzo: number;
}

/**
 * Prezza l'intera lista della spesa.
 *
 * Una ricerca per prodotto, a piccoli gruppi per non farsi limitare. Per ogni
 * prodotto si tengono fino a tre venditori, dal più economico: è ciò che
 * permette il confronto nella schermata, esattamente come con l'altra strada.
 *
 * Non lancia mai: un prodotto senza prezzo è una riga in meno, non un piano
 * perduto.
 */
export async function generatePricesSerpapi(
  items: string[],
  country: string,
  /**
   * Quante ricerche insieme. Otto e non quattro: la fase impiegava cinquanta
   * secondi e su iOS il sistema chiude la richiesta a sessanta, quindi il
   * margine serviva. SerpAPI regge questa concorrenza senza limitare.
   */
  gruppo = 8,
): Promise<SerpPricesResult> {
  const prezzi: SerpPriceRow[] = [];
  let ricerche = 0;
  let senzaPrezzo = 0;

  for (let i = 0; i < items.length; i += gruppo) {
    const parte = items.slice(i, i + gruppo);

    const esiti = await Promise.all(
      parte.map(async (voce) => {
        ricerche += 1;
        try {
          const res = await searchShopping(voce, country, 10);
          if (!res.ok) return { voce, righe: [] as SerpPriceRow[] };

          const buoni = res.items
            .filter((it) => plausibile(it, voce))
            .sort((a, b) => (a.price ?? 0) - (b.price ?? 0))
            // Tre venditori bastano: oltre, la schermata diventa un elenco.
            .slice(0, 3)
            .map((it) => ({
              prodotto: voce,
              nome: it.title,
              prezzo: it.price,
              valuta: it.currency,
              negozio: it.source,
              link: it.link,
              immagine: it.thumbnail || undefined,
            }));

          return { voce, righe: buoni };
        } catch (err) {
          console.warn(`[serpapi] "${voce}" non prezzato:`, err);
          return { voce, righe: [] as SerpPriceRow[] };
        }
      }),
    );

    for (const e of esiti) {
      if (e.righe.length === 0) senzaPrezzo += 1;
      prezzi.push(...e.righe);
    }
  }

  return { prezzi, ricerche, senzaPrezzo };
}
