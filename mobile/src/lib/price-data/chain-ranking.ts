/**
 * Classifica delle catene per convenienza — dati di indagine, non stime.
 *
 * PERCHÉ ESISTE QUESTO FILE
 * -------------------------
 * Il prototipo confrontava i supermercati con moltiplicatori scritti a mano
 * (`Eurospin ×0,84`, `Lidl ×0,88`). Non era un confronto: era una costante.
 * Eurospin risultava sempre il più conveniente perché il numero diceva così.
 *
 * Qui i dati vengono dall'indagine annuale di Altroconsumo, pubblicata il
 * 1° settembre 2026: 1,5 milioni di prezzi rilevati in 1.158 punti vendita
 * di 67 città, su 124 categorie di prodotto, fra il 16 febbraio e il 13
 * marzo 2026.
 *
 * QUELLO CHE QUESTI DATI DICONO, E QUELLO CHE NON DICONO
 * -----------------------------------------------------
 * Dicono che una catena è mediamente più economica di un'altra sul paniere
 * dell'indagine. NON dicono quanto costa la tua lista in un negozio preciso:
 * per quello serve la verifica prodotto per prodotto.
 *
 * L'interfaccia deve mantenere questa distinzione: "Eurospin è mediamente il
 * più conveniente secondo Altroconsumo" è sostenibile, "la tua spesa da
 * Eurospin costa 94 €" no.
 *
 * NOTE PER CHI AGGIORNA
 * ---------------------
 * L'indagine esce una volta l'anno: questa riga di dati va rinnovata a ogni
 * edizione, ed è una voce di manutenzione nel contratto.
 *
 * Sull'uso: la classifica pubblicata è stata ripresa da tutte le testate e
 * citarla con la fonte è normale. Prima della pubblicazione sugli store,
 * però, conviene una richiesta scritta ad Altroconsumo: costa nulla e toglie
 * un rischio.
 */

export interface ChainRank {
  name: string;
  /** Indice: 100 = la catena più economica della rilevazione. */
  index: number;
  kind: "discount" | "supermercato" | "ipermercato";
  /** Nota specifica pubblicata dall'indagine, quando c'è. */
  note?: string;
}

export const SURVEY = {
  source: "Altroconsumo",
  title: "Indagine supermercati 2026",
  publishedOn: "2026-09-01",
  url: "https://www.altroconsumo.it/alimentazione/fare-la-spesa/news/indagine-supermercati-convenienti-2026",
  pricesCompared: 1_500_000,
  stores: 1_158,
  cities: 67,
  categories: 124,
  fieldwork: "16 febbraio – 13 marzo 2026",
  /** Spesa annua media della famiglia di riferimento (4 persone). */
  averageAnnualSpend: 9_450,
  /** Risparmio massimo annuo scegliendo l'insegna più conveniente. */
  maxAnnualSaving: 3_790,
} as const;

/**
 * Solo i valori effettivamente pubblicati.
 *
 * Le posizioni intermedie della classifica non sono state diffuse per
 * intero, e inventarle sarebbe tornare al punto di partenza. Qui ci sono
 * i tre estremi documentati più le indicazioni per categoria.
 */
export const CHAIN_RANKING: ChainRank[] = [
  {
    name: "Eurospin",
    index: 100,
    kind: "discount",
    note: "Il più economico d'Italia, confermato anche quest'anno",
  },
  {
    name: "In's Mercato",
    index: 102,
    kind: "discount",
    note: "Fra i discount più convenienti per la spesa mista",
  },
  {
    name: "Dok",
    index: 110,
    kind: "supermercato",
    note: "La nuova entrata più economica fra super e iper",
  },
  {
    name: "Spazio Conad",
    index: 112,
    kind: "supermercato",
    note: "Il migliore per i prodotti a marchio del supermercato: −19% sul più caro",
  },
  {
    name: "Ipercoop",
    index: 117,
    kind: "ipermercato",
    note: "Prezzi mediamente il 17% più alti rispetto a Eurospin",
  },
  {
    name: "Carrefour Market",
    index: 135,
    kind: "supermercato",
    note: "Ultimo della rilevazione: prezzi più alti del 35%",
  },
];

/** Le regioni, come pubblicate. */
export const REGION_SPEND = {
  cheapest: { regions: ["Veneto", "Trentino-Alto Adige"], annual: 7_000 },
  dearest: { regions: ["Valle d'Aosta", "Lazio"], annual: 7_900, deltaPercent: 13 },
} as const;

/**
 * Stima del risparmio annuo passando dalla catena `from` a quella `to`.
 *
 * Proporzionale alla spesa annua della famiglia: chi spende meno risparmia
 * meno in valore assoluto, il che è ovvio ma va detto, perché il titolo
 * "3.790 € l'anno" vale per la famiglia di riferimento dell'indagine.
 */
export function annualSaving(fromIndex: number, toIndex: number, annualSpend: number): number {
  if (fromIndex <= toIndex) return 0;
  const ratio = (fromIndex - toIndex) / fromIndex;
  return Math.round(annualSpend * ratio);
}

/**
 * Spesa annua stimata a partire dal budget dell'utente.
 * Settimanale × 52, mensile × 12. Restituisce 0 se il budget manca.
 */
export function annualSpendFrom(budget: number, frequency: "weekly" | "monthly"): number {
  if (!Number.isFinite(budget) || budget <= 0) return 0;
  return Math.round(budget * (frequency === "monthly" ? 12 : 52));
}
