/**
 * Quanto ce n'e' dentro, letto dal nome del prodotto.
 *
 * PERCHE' SERVE, E PERCHE' E' IL PEZZO CHE MANCA DI PIU'
 * ------------------------------------------------------
 * L'app mette in colonna:
 *
 *     Carrefour   zucchine 500 g    1,39 €      ← sembra la piu' conveniente
 *     Aldi        zucchine 1 kg     2,19 €
 *
 * e chi legge sceglie Carrefour. Sbagliando: sono 2,78 €/kg contro 2,19.
 *
 * Per un'app che promette di far risparmiare, questo e' il confronto sbagliato
 * al centro della schermata — e non e' un dettaglio estetico, e' la cosa
 * stessa che l'utente e' venuto a fare.
 *
 * COSA SI TROVA DAVVERO NEI NOMI
 * ------------------------------
 * Censito il 16 settembre su 283.653 prodotti veri:
 *
 *                              Italia   Regno Unito
 *   «500 g» staccato            32,6%      3,0%
 *   «500g» attaccato             9,5%     30,5%
 *   «gr500» rovesciato          13,3%        0%
 *   «4 x 100g» moltiplicato      0,7%      2,0%
 *   ─────────────────────────────────────────────
 *   col peso nel nome           56,1%     35,4%
 *
 * I due paesi lo scrivono al contrario: l'Italia stacca, l'Inghilterra attacca,
 * e l'Italia ha una terza forma tutta sua. Un lettore che ne conosce una sola
 * funziona in un paese e tace nell'altro — ed e' esattamente il difetto a
 * macchie che si vedeva prima.
 *
 * Il resto dei nomi (44% in Italia, 65% in Inghilterra) non ha un peso perche'
 * non ce l'ha: frutta e verdura sfusa, roba al banco. La' il prezzo al chilo
 * o e' gia' quello, o non si puo' calcolare, e si risponde `null` — che e'
 * un'informazione vera.
 */

export type Unita = "g" | "ml" | "pz";

export interface Quantita {
  /** Normalizzato: grammi, millilitri o pezzi. */
  valore: number;
  unita: Unita;
  /** Com'era scritto nel nome, per poterlo mostrare e per poter verificare. */
  testo: string;
}

/** Da come si scrive a quanto vale in grammi, millilitri o pezzi. */
const FATTORI: Record<string, { unita: Unita; per: number }> = {
  kg: { unita: "g", per: 1000 },
  kgs: { unita: "g", per: 1000 },
  g: { unita: "g", per: 1 },
  gr: { unita: "g", per: 1 },
  grs: { unita: "g", per: 1 },
  grammi: { unita: "g", per: 1 },
  gramm: { unita: "g", per: 1 },
  mg: { unita: "g", per: 0.001 },

  l: { unita: "ml", per: 1000 },
  lt: { unita: "ml", per: 1000 },
  ltr: { unita: "ml", per: 1000 },
  litro: { unita: "ml", per: 1000 },
  litri: { unita: "ml", per: 1000 },
  liter: { unita: "ml", per: 1000 },
  cl: { unita: "ml", per: 10 },
  dl: { unita: "ml", per: 100 },
  ml: { unita: "ml", per: 1 },

  pz: { unita: "pz", per: 1 },
  pezzi: { unita: "pz", per: 1 },
  pcs: { unita: "pz", per: 1 },
  pack: { unita: "pz", per: 1 },
  stk: { unita: "pz", per: 1 },
  unid: { unita: "pz", per: 1 },
};

const UNITA_ALT = Object.keys(FATTORI).sort((a, b) => b.length - a.length).join("|");

/** La virgola decimale italiana e il punto inglese sono la stessa cosa. */
function numero(s: string): number {
  return Number(s.replace(",", "."));
}

/**
 * Il peso o il volume scritto nel nome, se c'e'.
 *
 * Le quattro forme si provano nell'ordine in cui e' piu' sicuro riconoscerle:
 * il moltiplicatore per primo, perche' «4 x 100 g» contiene anche «100 g» e
 * leggendo quello si otterrebbe un quarto del vero.
 */
export function quantitaDa(nome: string): Quantita | null {
  const t = ` ${String(nome).toLowerCase()} `;

  /* 1. «4 x 100 g», «6x1,5 l» — la confezione multipla.
        Va per prima: dentro c'e' anche «100 g», e leggere quello darebbe un
        quarto del contenuto vero. E' l'errore che trasformerebbe una
        confezione famiglia nella piu' cara del confronto. */
  const molti = t.match(
    new RegExp(`[\\s(]([0-9]{1,2})\\s*[x×]\\s*([0-9]+(?:[.,][0-9]+)?)\\s*(${UNITA_ALT})(?![a-z])`),
  );
  if (molti) {
    const f = FATTORI[molti[3]];
    const valore = Number(molti[1]) * numero(molti[2]) * f.per;
    if (plausibile(valore, f.unita)) {
      return { valore, unita: f.unita, testo: molti[0].trim() };
    }
  }

  /* 2. «gr500», «g 500» — l'unita' prima del numero.
        Tredici per cento dei prodotti italiani, zero altrove. Va prima della
        forma normale perche' «gr500» contiene «500» e senza questa riga
        finirebbe fra i numeri senza unita'. */
  const rovescio = t.match(new RegExp(`[\\s(](${UNITA_ALT})\\s?([0-9]+(?:[.,][0-9]+)?)(?![a-z0-9])`));
  if (rovescio) {
    const f = FATTORI[rovescio[1]];
    const valore = numero(rovescio[2]) * f.per;
    if (plausibile(valore, f.unita)) {
      return { valore, unita: f.unita, testo: rovescio[0].trim() };
    }
  }

  /* 3. «500 g» e «500g» — la forma normale, staccata o attaccata.
        Sono la stessa cosa e si leggono insieme: il `\\s?` e' tutta la
        differenza fra l'Italia e l'Inghilterra.

        SI PRENDE L'ULTIMA, non la prima. I nomi dei cataloghi cominciano
        spesso con la marca e finiscono col formato — «Barilla pasta integrale
        fusilli 500g» — e quando un numero compare prima e' quasi sempre altro:
        una percentuale, un numero di formato, un codice. */
  const tutte = [
    ...t.matchAll(new RegExp(`[\\s(]([0-9]+(?:[.,][0-9]+)?)\\s?(${UNITA_ALT})(?![a-z])`, "g")),
  ];
  const ultima = tutte[tutte.length - 1];
  if (ultima) {
    const f = FATTORI[ultima[2]];
    const valore = numero(ultima[1]) * f.per;
    if (plausibile(valore, f.unita)) {
      return { valore, unita: f.unita, testo: ultima[0].trim() };
    }
  }

  return null;
}

/**
 * Questo numero puo' essere un peso vero?
 *
 * I nomi dei cataloghi sono pieni di cifre che non sono quantita': codici
 * prodotto, EAN, anni, percentuali. `000000000000488` e `7504685` sono nomi
 * veri, visti nel catalogo italiano.
 *
 * I limiti non sono severi: un chicco di zafferano pesa mezzo grammo, un sacco
 * di farina venti chili. Servono a scartare l'assurdo, non a fare la dogana.
 */
function plausibile(valore: number, unita: Unita): boolean {
  if (!Number.isFinite(valore) || valore <= 0) return false;
  if (unita === "pz") return valore <= 240;
  // Mezzo grammo (una bustina di zafferano) fino a cinquanta chili (un sacco).
  return valore >= 0.5 && valore <= 50_000;
}

/**
 * Quanto costa un chilo, o un litro.
 *
 * `null` per i prodotti a pezzo — sei uova non si confrontano al chilo — e per
 * quelli senza peso nel nome. Dire «non lo so» e' un'informazione; inventare un
 * numero per riempire la casella e' il contrario.
 */
export function prezzoNormalizzato(
  prezzo: number | null,
  q: Quantita | null,
): { valore: number; unita: "kg" | "l" } | null {
  if (prezzo == null || !q || q.unita === "pz" || q.valore <= 0) return null;
  const valore = prezzo / (q.valore / 1000);
  // Oltre mille euro al chilo non e' un prezzo, e' una quantita' letta male.
  if (!Number.isFinite(valore) || valore <= 0 || valore > 1000) return null;
  return {
    valore: Math.round(valore * 100) / 100,
    unita: q.unita === "g" ? "kg" : "l",
  };
}
