/**
 * I prezzi dei negozi che non li scrivono nella pagina.
 *
 * IL FATTO
 * --------
 * Quarantadue insegne del nostro catalogo hanno le pagine perfettamente vive e
 * zero prezzi leggibili: 1,28 milioni di prodotti, di cui circa seicentomila
 * alimentari veri una volta tolti i doppioni e il negozio di elettronica.
 *
 * Non e' che quei negozi il prezzo lo nascondano. Lo servono da un'API, e la
 * pagina lo disegna dopo — il nostro lettore guarda l'HTML e li' non c'e'
 * niente. Li avevamo classificati come «non pubblicano i prezzi» quando la
 * verita' e' «lo pubblicano in un altro formato».
 *
 * Verificato aprendo le pagine a mano:
 *
 *   Consum   tienda.consum.es/es/p/leche-entera-brik/12559   →  1,39 € a schermo
 *            HTML: nessun campo prezzo, in 60 KB
 *            API:  /api/rest/V1.0/catalog/product?q=…  →  1.39, con EAN
 *
 *   dm       dm.de/p/d/1488263/dmbio-schokolade-vollmilch   →  1,65 € a schermo
 *            HTML: nessun campo prezzo
 *            API:  product-search.services.dmtech.com/…/search/crawl
 *
 * L'indirizzo di dm si chiama `/search/crawl`: e' la porta che hanno messo
 * apposta per chi legge il catalogo da programma. Non stiamo forzando niente.
 *
 * COME E' FATTO QUESTO FILE
 * -------------------------
 * Un lettore per insegna, perche' ogni negozio la sua API se l'e' disegnata a
 * modo suo e non esiste una forma comune. Ma lo scheletro e' uno: da un
 * indirizzo di scheda si ricava come interrogare l'API, e dalla risposta si
 * tira fuori un numero.
 *
 * Aggiungerne uno sono quindici righe. Sono ordinati per quanto valgono, cosi'
 * chi continua sa da dove pescare il prossimo.
 *
 * QUANDO VIENE USATO
 * ------------------
 * Solo quando l'HTML non ha dato niente. Chi il prezzo lo scrive nella pagina
 * — la maggioranza — non paga nessuna richiesta in piu'.
 */

/** Quel che serve sapere di un prezzo trovato per questa via. */
export interface PrezzoDaApi {
  prezzo: number;
  valuta?: string;
  /** Il nome come lo scrive il negozio: serve a controllare di non aver preso un altro prodotto. */
  nome?: string;
}

/**
 * Quanto si aspetta un'API prima di lasciar perdere.
 *
 * Sei secondi, meno degli otto della pagina: e' un tentativo in piu' su una
 * scheda che un prezzo non l'ha dato comunque, e non deve allungare la coda.
 */
const ATTESA_MS = 6_000;

const INTESTAZIONE = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};

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

interface Lettore {
  insegna: string;
  /** A quali indirizzi si applica. */
  host: RegExp;
  leggi: (url: string) => Promise<PrezzoDaApi | null>;
}

/* ══════════════════════════════════════════════════════════════════
   I LETTORI, dal piu' prezioso
   ══════════════════════════════════════════════════════════════════ */

const LETTORI: Lettore[] = [
  {
    /* CONSUM - 18.385 prodotti, in Spagna, che e' il paese messo peggio.

       SI CERCA PER CODICE, E SI PRETENDE CHE COMBACI.
       La prima versione cercava per nome, ricavato dallo slug, e accettava il
       risultato se il nome tornato somigliava abbastanza. Funzionava sugli
       indirizzi spagnoli e falliva su tutti gli altri: la sitemap di Consum
       pubblica anche il valenzano, e
       `/vl/p/melmelada-maduixa-0-sucres-afegits/7185288` cercato per nome non
       trova niente, perche' l'API risponde in spagnolo — «Mermelada Fresa».
       Misurato: dieci schede aperte, zero prezzi letti.

       Il numero in fondo all'indirizzo invece e' lo stesso nelle due lingue, e
       l'API lo restituisce nel campo `code`. Chiedendo quello si ottiene un
       solo risultato e si puo' CONTROLLARE che sia lui, invece di valutare
       quanto si somigliano due nomi. Un confronto esatto al posto di una
       stima: sparisce il rischio di attaccare il prezzo di un prodotto a un
       altro, che e' il danno peggiore che questo file possa fare.

       Nota per chi legge la versione precedente: diceva che il codice
       dell'indirizzo non e' quello dell'API, «12559 per l'API e' una colonia,
       non il latte». Non e' cosi'. Chiedendo `q=12559` torna un risultato
       solo, codice 12559, «Leche Entera Brik», 1,39 euro. Quella conclusione
       veniva dal prendere il primo prodotto dell'elenco senza guardare il
       codice. */
    insegna: "Consum",
    host: /(^|\.)consum\.es$/i,
    async leggi(url) {
      /* Ultimo pezzo dell'indirizzo: `/xx/p/<nome>/<codice>`. */
      const codice = /\/(\d{3,})\/?$/.exec(new URL(url).pathname)?.[1];
      if (!codice) return null;

      const d = (await json(
        `https://tienda.consum.es/api/rest/V1.0/catalog/product?q=${codice}&limit=5`,
        "es-ES,es;q=0.9",
      )) as { products?: Array<Record<string, any>> } | null;

      for (const p of d?.products ?? []) {
        /* Solo il prodotto giusto: una ricerca per numero puo' riportare
           anche chi quel numero ce l'ha nella descrizione. */
        if (String(p?.code ?? "") !== codice) continue;
        const v = sensato(p?.priceData?.prices?.[0]?.value?.centAmount);
        if (v !== null) {
          return { prezzo: v, valuta: "EUR", nome: String(p?.productData?.name ?? "") };
        }
      }
      return null;
    },
  },
  {
    /* DM — 20.966 in Germania piu' 13.577 in Austria.
       Qui l'identificativo nell'indirizzo E' quello giusto: `/p/d/1488263/…`,
       quindi la corrispondenza e' esatta e non serve confrontare i nomi.

       Il prezzo sta nell'etichetta pensata per i lettori di schermo —
       «Preis: 1,65 €» — che e' anche il posto piu' stabile: cambia quando
       cambia il prezzo, non quando ridisegnano il sito. */
    insegna: "dm",
    host: /(^|\.)dm\.(de|at)$/i,
    async leggi(url) {
      const id = /\/p\/(?:d\/)?(\d{4,})/.exec(new URL(url).pathname)?.[1];
      if (!id) return null;
      const paese = new URL(url).hostname.endsWith(".at") ? "at" : "de";
      const d = (await json(
        `https://product-search.services.dmtech.com/${paese}/search/crawl?query=${id}`,
        paese === "at" ? "de-AT,de;q=0.9" : "de-DE,de;q=0.9",
      )) as { products?: Array<Record<string, any>> } | null;

      const p = d?.products?.find((x) => String(x?.dan) === id) ?? d?.products?.[0];
      if (!p) return null;

      const etichetta = String(p?.tileData?.a11yLabel ?? "");
      const v = sensato(/Preis:\s*([\d.,]+)/i.exec(etichetta)?.[1]);
      return v === null ? null : { prezzo: v, valuta: "EUR", nome: String(p?.title ?? "") };
    },
  },
];

/**
 * Il prezzo di questa scheda, chiesto all'API del suo negozio.
 *
 * `null` quando il negozio non ha un lettore, quando l'API non risponde, o
 * quando risponde con qualcosa che non e' il prodotto giusto. In tutti e tre i
 * casi chi chiama si comporta come prima: riga senza prezzo, prodotto e link
 * buoni lo stesso.
 */
export async function prezzoDaApi(url: string): Promise<PrezzoDaApi | null> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  const lettore = LETTORI.find((l) => l.host.test(host));
  if (!lettore) return null;
  try {
    return await lettore.leggi(url);
  } catch {
    return null;
  }
}

/** C'e' un lettore per questo indirizzo? Evita un tentativo inutile. */
export function haLettoreApi(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return LETTORI.some((l) => l.host.test(host));
  } catch {
    return false;
  }
}

/** Quali insegne sappiamo leggere per questa via: per lo stato e le prove. */
export function insegneConApi(): string[] {
  return LETTORI.map((l) => l.insegna);
}
