/**
 * Prezzi a blocchi: cento per chiamata invece di uno per pagina.
 *
 * IL CONTO CHE CAMBIA TUTTO
 * -------------------------
 * Aprire una scheda per leggerne il prezzo costa una richiesta e restituisce
 * UN prezzo. Con 1.787.883 indirizzi in magazzino, prezzarli tutti sarebbe
 * 1.787.883 richieste: a dodici al secondo sono quarantuno ore di martellamento
 * continuo sui negozi. Non e' un limite tecnico da aggirare — e' che non si fa.
 *
 * Certi negozi pero' hanno un'API di ricerca che torna CENTO prodotti per
 * chiamata, e ognuno gia' col suo prezzo e il suo indirizzo. Misurato su
 * Consum: `?q=queso&limit=100` restituisce cento formaggi prezzati in una
 * richiesta sola. Lo stesso fa EBSN, la piattaforma di Naturasi.
 *
 * Cento volte meno richieste vuol dire che due milioni di prezzi diventano
 * ventimila chiamate invece di due milioni. E' la differenza fra «impossibile
 * e maleducato» e «mezz'ora, di notte».
 *
 * PERCHE' NON SERVE SAPERE COSA CHIEDERE
 * --------------------------------------
 * La risposta contiene l'INDIRIZZO di ogni prodotto, non solo il nome. Quindi
 * non c'e' niente da riconciliare col nostro catalogo: si cerca una parola, si
 * prende quel che torna, e lo si salva com'e'. Se un prodotto non e' nel nostro
 * catalogo entra lo stesso in magazzino, e quando qualcuno lo chiedera' il
 * prezzo sara' gia' li'.
 *
 * SI CERCA CON LE PAROLE DELLA SPESA
 * ----------------------------------
 * Non si puo' enumerare: `q=a` torna zero, la ricerca vuole parole vere.
 * Quindi si passano le voci della spesa di base nella lingua del negozio —
 * le stesse che usa `prezzi-notturni.ts`. Con centocinquanta parole per cento
 * risultati si coprono quindicimila prodotti per insegna, e sono proprio
 * quelli che la gente compra.
 *
 * SUL RISPETTO DEI NEGOZI
 * -----------------------
 * Questa strada ne TOGLIE di carico, non ne aggiunge: cento prodotti in una
 * richiesta invece di cento richieste. Una pausa fra una chiamata e l'altra
 * c'e' lo stesso, ed e' piu' lunga di quella delle pagine — un'API risponde
 * piu' in fretta, quindi senza freno si andrebbe molto piu' forte di prima.
 */

import { salvaPrezzi, type PrezzoSalvato } from "./prezzi-magazzino.js";

/** Una pausa generosa: l'API risponde in fretta, e non e' una buona ragione per correre. */
const PAUSA_MS = 400;
/** Quanti risultati chiedere. Oltre cento nessuno dei due ne da' di piu'. */
const PER_CHIAMATA = 100;
const ATTESA_MS = 20_000;

const INTESTAZIONE = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Un prodotto come lo restituisce un'API a blocchi: tutto quel che serve per salvarlo. */
interface Trovato {
  url: string;
  nome: string;
  prezzo: number;
}

interface LettoreABlocchi {
  insegna: string;
  paese: string;
  /** Cerca una parola e torna quel che l'API sa dire. */
  cerca: (parola: string) => Promise<Trovato[]>;
}

async function json(url: string, lingua: string): Promise<unknown | null> {
  try {
    const r = await fetch(url, {
      headers: { ...INTESTAZIONE, "Accept-Language": lingua },
      signal: AbortSignal.timeout(ATTESA_MS),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Un numero plausibile per la spesa: sotto un centesimo o sopra mille, no. */
function sensato(n: unknown): number | null {
  const x = typeof n === "string" ? Number.parseFloat(n.replace(",", ".")) : Number(n);
  return Number.isFinite(x) && x > 0.01 && x < 1000 ? x : null;
}

export const LETTORI_A_BLOCCHI: LettoreABlocchi[] = [
  {
    /* CONSUM — misurato: `?q=queso&limit=100` torna cento formaggi prezzati, e
       ognuno porta il suo indirizzo. `totalCount` dice quanti ce ne sarebbero,
       ma oltre cento non ne da'. */
    insegna: "Consum",
    paese: "ES",
    async cerca(parola) {
      const d = (await json(
        `https://tienda.consum.es/api/rest/V1.0/catalog/product?q=${encodeURIComponent(parola)}&limit=${PER_CHIAMATA}`,
        "es-ES,es;q=0.9",
      )) as { products?: Array<Record<string, any>> } | null;

      const fuori: Trovato[] = [];
      for (const p of d?.products ?? []) {
        const url = String(p?.productData?.url ?? "");
        const nome = String(p?.productData?.name ?? "");
        const prezzo = sensato(p?.priceData?.prices?.[0]?.value?.centAmount);
        if (url && nome && prezzo !== null) fuori.push({ url, nome, prezzo });
      }
      return fuori;
    },
  },
  {
    /* NATURASI — piattaforma EBSN. Stessa forma, nomi dei campi diversi:
       l'indirizzo e' `itemUrl` ed e' relativo, il prezzo sta in `price`.

       Delle sei italiane su EBSN e' l'unica utilizzabile: CoopShop e Basko
       rispondono senza il campo prezzo, Ali' e Tigros vietano `/ebsn/` nel
       robots.txt. Vedi le note delle singole insegne sul database. */
    insegna: "Naturasi",
    paese: "IT",
    async cerca(parola) {
      const d = (await json(
        `https://www.naturasi.it/ebsn/api/products?q=${encodeURIComponent(parola)}&page_size=${PER_CHIAMATA}`,
        "it-IT,it;q=0.9",
      )) as { data?: { products?: Array<Record<string, any>> } } | null;

      const fuori: Trovato[] = [];
      for (const p of d?.data?.products ?? []) {
        const slug = String(p?.slug ?? "");
        const nome = String(p?.name ?? "");
        const prezzo = sensato(p?.price ?? p?.priceDisplay);
        if (slug && nome && prezzo !== null) {
          fuori.push({ url: `https://www.naturasi.it/prodotti/${slug}`, nome, prezzo });
        }
      }
      return fuori;
    },
  },
];

/** C'e' un lettore a blocchi per questa insegna? */
export function haLettoreABlocchi(insegna: string): boolean {
  return LETTORI_A_BLOCCHI.some((l) => l.insegna === insegna);
}

/**
 * Raccoglie a blocchi i prezzi di un'insegna, cercando le parole date.
 *
 * Torna quanti prezzi ha salvato. Gli indirizzi doppi si tolgono qui: la
 * stessa scheda esce da piu' ricerche — «latte» e «latte intero» si
 * sovrappongono — e salvarla due volte sarebbe una scrittura sprecata.
 */
export async function raccogliABlocchi(
  lettore: LettoreABlocchi,
  parole: string[],
): Promise<{ chiamate: number; prezzi: number }> {
  const visti = new Map<string, Trovato>();
  let chiamate = 0;

  for (const parola of parole) {
    const trovati = await lettore.cerca(parola);
    chiamate++;
    for (const t of trovati) if (!visti.has(t.url)) visti.set(t.url, t);
    await attendi(PAUSA_MS);
  }

  const righe: PrezzoSalvato[] = [...visti.values()].map((t) => ({
    url: t.url,
    prezzo: t.prezzo,
    valuta: "EUR",
    nome: t.nome,
    insegna: lettore.insegna,
    verifica: "verificato" as const,
    visto: new Date(),
  }));

  /* A blocchi di cinquecento: una scrittura sola da quindicimila righe e' un
     documento troppo grosso per un piano gratuito, e se fallisce si perde
     tutto invece di meta'. */
  for (let i = 0; i < righe.length; i += 500) {
    await salvaPrezzi(righe.slice(i, i + 500));
  }

  return { chiamate, prezzi: righe.length };
}
